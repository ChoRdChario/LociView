#include <emscripten/emscripten.h>

#include <libheif/heif.h>
#include <libheif/heif_items.h>
#include <libheif/heif_sequences.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <memory>

namespace {

constexpr uint32_t kAbiVersion = 1;
constexpr uint32_t kFlagGrid = 1u << 0;
constexpr uint32_t kFlagAlpha = 1u << 1;
constexpr size_t kMessageCapacity = 256;

enum Status : int32_t {
  kOk = 0,
  kNotInitialized = 1,
  kInvalidArgument = 2,
  kInvalidContainer = 3,
  kUnsupportedSequence = 4,
  kUnsupportedCollection = 5,
  kMissingPrimary = 6,
  kUnsupportedCodec = 7,
  kLimitExceeded = 8,
  kDecodeFailed = 9,
  kAllocationFailed = 10,
  kInternalError = 11,
};

enum MimeCode : uint32_t {
  kMimeUnknown = 0,
  kMimeHeic = 1,
  kMimeHeif = 2,
};

#pragma pack(push, 1)
struct LvHeicResultV1 {
  uint32_t abi_version;
  int32_t status;
  int32_t heif_error_code;
  int32_t heif_suberror_code;
  uint32_t mime_code;
  uint32_t flags;
  uint32_t declared_width;
  uint32_t declared_height;
  uint32_t output_width;
  uint32_t output_height;
  uint32_t rgba_ptr;
  uint32_t stride;
  uint32_t row_bytes;
  uint32_t rgba_bytes;
  uint32_t primary_item_type;
  uint32_t top_level_count;
  uint32_t track_count;
  uint32_t warning_count;
  uint32_t message_ptr;
  uint32_t message_bytes;
};
#pragma pack(pop)

static_assert(sizeof(LvHeicResultV1) == 80, "PoC result ABI must remain 80 bytes");
static_assert(sizeof(void*) == sizeof(uint32_t), "PoC bridge requires wasm32 pointers");

bool g_initialized = false;
uint8_t* g_input = nullptr;
uint32_t g_input_bytes = 0;
uint8_t* g_rgba = nullptr;
LvHeicResultV1 g_result{};
char g_message[kMessageCapacity]{};

void reset_result() {
  std::memset(&g_result, 0, sizeof(g_result));
  std::memset(g_message, 0, sizeof(g_message));
  g_result.abi_version = kAbiVersion;
  g_result.status = kInternalError;
  g_result.message_ptr = static_cast<uint32_t>(reinterpret_cast<uintptr_t>(g_message));
}

void set_message(const char* message) {
  const char* safe_message = message == nullptr ? "unspecified decoder error" : message;
  std::snprintf(g_message, sizeof(g_message), "%s", safe_message);
  g_result.message_bytes = static_cast<uint32_t>(std::strlen(g_message));
}

const LvHeicResultV1* fail(Status status, const char* message, const heif_error* error = nullptr) {
  g_result.status = status;
  if (error != nullptr) {
    g_result.heif_error_code = static_cast<int32_t>(error->code);
    g_result.heif_suberror_code = static_cast<int32_t>(error->subcode);
    set_message(error->message == nullptr ? message : error->message);
  } else {
    set_message(message);
  }
  return &g_result;
}

uint64_t lower_limit_u64(uint64_t current, uint64_t requested) {
  if (current == 0) return requested;
  return std::min(current, requested);
}

uint32_t lower_limit_u32(uint32_t current, uint32_t requested) {
  if (current == 0) return requested;
  return std::min(current, requested);
}

bool checked_area(uint32_t width, uint32_t height, uint64_t* area) {
  if (width == 0 || height == 0) return false;
  *area = static_cast<uint64_t>(width) * static_cast<uint64_t>(height);
  return true;
}

bool brand_present(const uint8_t* bytes, int length, heif_brand2 main_brand, const char brand[5]) {
  return main_brand == heif_fourcc(brand[0], brand[1], brand[2], brand[3]) ||
         heif_has_compatible_brand(bytes, length, brand) == 1;
}

MimeCode classify_mime(const uint8_t* bytes, int length, heif_brand2 main_brand) {
  if (brand_present(bytes, length, main_brand, "heic") ||
      brand_present(bytes, length, main_brand, "heix")) {
    return kMimeHeic;
  }
  if (brand_present(bytes, length, main_brand, "mif1") ||
      brand_present(bytes, length, main_brand, "mif2") ||
      brand_present(bytes, length, main_brand, "mif3")) {
    return kMimeHeif;
  }
  return kMimeUnknown;
}

bool has_rejected_profile_brand(const uint8_t* bytes, int length, heif_brand2 main_brand) {
  constexpr const char* rejected[] = {
      "hevc", "hevx", "hevm", "hevs", "msf1", "avis", "vvis", "heim", "heis"};
  for (const char* brand : rejected) {
    if (brand_present(bytes, length, main_brand, brand)) return true;
  }
  return false;
}

bool primary_is_bounded_hevc(
    heif_context* context,
    const heif_image_handle* handle,
    heif_item_id primary_id,
    uint32_t max_tiles,
    uint32_t* flags,
    heif_error* error) {
  const uint32_t item_type = heif_item_get_item_type(context, primary_id);
  g_result.primary_item_type = item_type;
  if (item_type == heif_item_type_hvc1) return true;
  if (item_type != heif_item_type_grid) return false;

  heif_image_tiling tiling{};
  *error = heif_image_handle_get_image_tiling(handle, 0, &tiling);
  if (error->code != heif_error_Ok || tiling.number_of_extra_dimensions != 0 ||
      tiling.num_columns == 0 || tiling.num_rows == 0) {
    return false;
  }

  const uint64_t tile_count =
      static_cast<uint64_t>(tiling.num_columns) * static_cast<uint64_t>(tiling.num_rows);
  if (tile_count == 0 || tile_count > max_tiles) {
    error->code = heif_error_Memory_allocation_error;
    error->subcode = heif_suberror_Security_limit_exceeded;
    error->message = "grid tile count exceeds the PoC budget";
    return false;
  }

  for (uint32_t y = 0; y < tiling.num_rows; ++y) {
    for (uint32_t x = 0; x < tiling.num_columns; ++x) {
      heif_item_id tile_id = 0;
      *error = heif_image_handle_get_grid_image_tile_id(handle, 0, x, y, &tile_id);
      if (error->code != heif_error_Ok ||
          heif_item_get_item_type(context, tile_id) != heif_item_type_hvc1) {
        return false;
      }
    }
  }

  *flags |= kFlagGrid;
  return true;
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE int32_t lv_heic_init() {
  if (g_initialized) return 0;
  const heif_error error = heif_init(nullptr);
  if (error.code != heif_error_Ok) return static_cast<int32_t>(error.code);
  g_initialized = true;
  reset_result();
  return 0;
}

EMSCRIPTEN_KEEPALIVE void lv_heic_release() {
  if (g_rgba != nullptr) {
    std::free(g_rgba);
    g_rgba = nullptr;
  }
  if (g_input != nullptr) {
    std::free(g_input);
    g_input = nullptr;
  }
  g_input_bytes = 0;
  reset_result();
}

EMSCRIPTEN_KEEPALIVE uint32_t lv_heic_alloc_input(uint32_t input_bytes, uint32_t max_input_bytes) {
  lv_heic_release();
  if (!g_initialized || input_bytes == 0 || max_input_bytes == 0 || input_bytes > max_input_bytes) {
    return 0;
  }
  g_input = static_cast<uint8_t*>(std::malloc(input_bytes));
  if (g_input == nullptr) return 0;
  g_input_bytes = input_bytes;
  return static_cast<uint32_t>(reinterpret_cast<uintptr_t>(g_input));
}

EMSCRIPTEN_KEEPALIVE const LvHeicResultV1* lv_heic_decode(
    uint32_t max_dimension,
    uint32_t max_pixels,
    uint32_t max_output_bytes,
    uint32_t max_total_memory,
    uint32_t max_items,
    uint32_t max_tiles) {
  if (g_rgba != nullptr) {
    std::free(g_rgba);
    g_rgba = nullptr;
  }
  reset_result();

  if (!g_initialized) return fail(kNotInitialized, "decoder is not initialized");
  if (g_input == nullptr || g_input_bytes < 12 || max_dimension == 0 || max_pixels == 0 ||
      max_output_bytes == 0 || max_total_memory == 0 || max_items == 0 || max_tiles == 0) {
    return fail(kInvalidArgument, "missing input or invalid decoder budget");
  }
  if (g_input_bytes > static_cast<uint32_t>(std::numeric_limits<int>::max())) {
    return fail(kLimitExceeded, "input length is not addressable by libheif");
  }

  const int input_length = static_cast<int>(g_input_bytes);
  const heif_filetype_result filetype = heif_check_filetype(g_input, input_length);
  if (filetype == heif_filetype_no) {
    return fail(kInvalidContainer, "input is not a HEIF container");
  }

  using Context = std::unique_ptr<heif_context, decltype(&heif_context_free)>;
  using Handle = std::unique_ptr<heif_image_handle, decltype(&heif_image_handle_release)>;
  using Image = std::unique_ptr<heif_image, decltype(&heif_image_release)>;
  using Options = std::unique_ptr<heif_decoding_options, decltype(&heif_decoding_options_free)>;

  Context context(heif_context_alloc(), &heif_context_free);
  if (!context) return fail(kAllocationFailed, "could not allocate libheif context");

  heif_security_limits* limits = heif_context_get_security_limits(context.get());
  if (limits == nullptr) return fail(kInternalError, "libheif security limits are unavailable");
  limits->max_image_size_pixels = lower_limit_u64(limits->max_image_size_pixels, max_pixels);
  limits->max_number_of_tiles = lower_limit_u64(limits->max_number_of_tiles, max_tiles);
  limits->max_items = lower_limit_u32(limits->max_items, max_items);
  limits->max_color_profile_size =
      lower_limit_u32(limits->max_color_profile_size, 4u * 1024u * 1024u);
  limits->max_memory_block_size = lower_limit_u64(limits->max_memory_block_size, max_total_memory);
  limits->max_components = lower_limit_u32(limits->max_components, 16u);
  limits->max_iloc_extents_per_item = lower_limit_u32(limits->max_iloc_extents_per_item, 32u);
  limits->max_size_entity_group = lower_limit_u32(limits->max_size_entity_group, 64u);
  limits->max_children_per_box = lower_limit_u32(limits->max_children_per_box, 100u);
  if (limits->version >= 2) {
    limits->max_total_memory = lower_limit_u64(limits->max_total_memory, max_total_memory);
    limits->max_sample_description_box_entries =
        lower_limit_u32(limits->max_sample_description_box_entries, 64u);
    limits->max_sample_group_description_box_entries =
        lower_limit_u32(limits->max_sample_group_description_box_entries, 64u);
  }
  if (limits->version >= 3) {
    limits->max_sequence_frames = lower_limit_u32(limits->max_sequence_frames, 1u);
    limits->max_number_of_file_brands = lower_limit_u32(limits->max_number_of_file_brands, 64u);
  }
  heif_context_set_max_decoding_threads(context.get(), 1);

  heif_error error = heif_context_read_from_memory_without_copy(
      context.get(), g_input, static_cast<size_t>(g_input_bytes), nullptr);
  if (error.code != heif_error_Ok) return fail(kInvalidContainer, "HEIF parse failed", &error);

  g_result.track_count = static_cast<uint32_t>(
      std::max(0, heif_context_number_of_sequence_tracks(context.get())));
  if (heif_context_has_sequence(context.get()) != 0) {
    return fail(kUnsupportedSequence, "image sequences and timeline tracks are unsupported");
  }

  const int top_level_count = heif_context_get_number_of_top_level_images(context.get());
  g_result.top_level_count = static_cast<uint32_t>(std::max(0, top_level_count));
  if (top_level_count != 1) {
    return fail(kUnsupportedCollection, "exactly one top-level still image is required");
  }

  heif_item_id primary_id = 0;
  error = heif_context_get_primary_image_ID(context.get(), &primary_id);
  if (error.code != heif_error_Ok || primary_id == 0 ||
      heif_context_is_top_level_image_ID(context.get(), primary_id) == 0) {
    return fail(kMissingPrimary, "a top-level primary image is required", &error);
  }

  heif_image_handle* raw_handle = nullptr;
  error = heif_context_get_primary_image_handle(context.get(), &raw_handle);
  if (error.code != heif_error_Ok || raw_handle == nullptr) {
    return fail(kMissingPrimary, "could not obtain the primary image", &error);
  }
  Handle handle(raw_handle, &heif_image_handle_release);
  if (heif_image_handle_is_primary_image(handle.get()) == 0 ||
      heif_image_handle_get_item_id(handle.get()) != primary_id) {
    return fail(kMissingPrimary, "primary image identity is inconsistent");
  }

  uint32_t flags = heif_image_handle_has_alpha_channel(handle.get()) != 0 ? kFlagAlpha : 0;
  heif_error item_error{};
  if (!primary_is_bounded_hevc(
          context.get(), handle.get(), primary_id, max_tiles, &flags, &item_error)) {
    if (item_error.subcode == heif_suberror_Security_limit_exceeded) {
      return fail(kLimitExceeded, "primary grid exceeds the tile budget", &item_error);
    }
    return fail(kUnsupportedCodec, "primary image is not direct/grid HEVC", &item_error);
  }
  g_result.flags = flags;

  const heif_brand2 main_brand = heif_read_main_brand(g_input, input_length);
  if (has_rejected_profile_brand(g_input, input_length, main_brand)) {
    return fail(kUnsupportedSequence, "sequence or layered HEIF profile is unsupported");
  }
  g_result.mime_code = classify_mime(g_input, input_length, main_brand);
  if (g_result.mime_code == kMimeUnknown) {
    return fail(kInvalidContainer, "validated HEVC primary has no accepted still HEIF brand");
  }

  const int declared_width = heif_image_handle_get_width(handle.get());
  const int declared_height = heif_image_handle_get_height(handle.get());
  if (declared_width <= 0 || declared_height <= 0) {
    return fail(kInvalidContainer, "primary image dimensions are invalid");
  }
  g_result.declared_width = static_cast<uint32_t>(declared_width);
  g_result.declared_height = static_cast<uint32_t>(declared_height);
  uint64_t declared_area = 0;
  if (g_result.declared_width > max_dimension || g_result.declared_height > max_dimension ||
      !checked_area(g_result.declared_width, g_result.declared_height, &declared_area) ||
      declared_area > max_pixels) {
    return fail(kLimitExceeded, "declared dimensions exceed the PoC budget");
  }

  if (heif_have_decoder_for_format(heif_compression_HEVC) == 0) {
    return fail(kInternalError, "the pinned libde265 decoder is not registered");
  }
  Options options(heif_decoding_options_alloc(), &heif_decoding_options_free);
  if (!options) return fail(kAllocationFailed, "could not allocate decode options");
  options->ignore_transformations = 0;
  options->convert_hdr_to_8bit = 1;
  options->strict_decoding = 1;
  options->decoder_id = "libde265";
  options->num_library_threads = 1;
  options->num_codec_threads = 1;

  heif_image* raw_image = nullptr;
  error = heif_decode_image(
      handle.get(), &raw_image, heif_colorspace_RGB, heif_chroma_interleaved_RGBA, options.get());
  if (error.code != heif_error_Ok || raw_image == nullptr) {
    return fail(kDecodeFailed, "HEVC decode failed", &error);
  }
  Image image(raw_image, &heif_image_release);

  if (heif_image_get_colorspace(image.get()) != heif_colorspace_RGB ||
      heif_image_get_chroma_format(image.get()) != heif_chroma_interleaved_RGBA ||
      heif_image_get_bits_per_pixel_range(image.get(), heif_channel_interleaved) != 8) {
    return fail(kDecodeFailed, "decoder did not produce RGBA8 output");
  }

  const int output_width = heif_image_get_width(image.get(), heif_channel_interleaved);
  const int output_height = heif_image_get_height(image.get(), heif_channel_interleaved);
  if (output_width <= 0 || output_height <= 0) {
    return fail(kDecodeFailed, "decoded dimensions are invalid");
  }
  g_result.output_width = static_cast<uint32_t>(output_width);
  g_result.output_height = static_cast<uint32_t>(output_height);
  if (g_result.output_width > max_dimension || g_result.output_height > max_dimension) {
    return fail(kLimitExceeded, "decoded dimensions exceed the PoC budget");
  }

  const uint64_t row_bytes = static_cast<uint64_t>(g_result.output_width) * 4u;
  const uint64_t output_bytes = row_bytes * static_cast<uint64_t>(g_result.output_height);
  uint64_t output_area = 0;
  if (!checked_area(g_result.output_width, g_result.output_height, &output_area) ||
      output_area > max_pixels || row_bytes > std::numeric_limits<uint32_t>::max() ||
      output_bytes > max_output_bytes || output_bytes > std::numeric_limits<uint32_t>::max()) {
    return fail(kLimitExceeded, "decoded RGBA output exceeds the PoC budget");
  }

  size_t source_stride = 0;
  const uint8_t* source =
      heif_image_get_plane_readonly2(image.get(), heif_channel_interleaved, &source_stride);
  if (source == nullptr || source_stride < row_bytes ||
      source_stride > std::numeric_limits<size_t>::max() / g_result.output_height) {
    return fail(kDecodeFailed, "decoded RGBA plane has an invalid stride");
  }

  g_result.warning_count = static_cast<uint32_t>(
      std::max(0, heif_image_get_decoding_warnings(image.get(), 0, nullptr, 0)));
  if (g_result.warning_count != 0) {
    return fail(kDecodeFailed, "decoder reported a recoverable bitstream error");
  }

  g_rgba = static_cast<uint8_t*>(std::malloc(static_cast<size_t>(output_bytes)));
  if (g_rgba == nullptr) return fail(kAllocationFailed, "could not allocate packed RGBA output");
  for (uint32_t y = 0; y < g_result.output_height; ++y) {
    std::memcpy(
        g_rgba + static_cast<size_t>(y) * static_cast<size_t>(row_bytes),
        source + static_cast<size_t>(y) * source_stride,
        static_cast<size_t>(row_bytes));
  }

  g_result.status = kOk;
  g_result.rgba_ptr = static_cast<uint32_t>(reinterpret_cast<uintptr_t>(g_rgba));
  g_result.stride = static_cast<uint32_t>(source_stride);
  g_result.row_bytes = static_cast<uint32_t>(row_bytes);
  g_result.rgba_bytes = static_cast<uint32_t>(output_bytes);
  set_message("ok");
  return &g_result;
}

EMSCRIPTEN_KEEPALIVE void lv_heic_shutdown() {
  lv_heic_release();
  if (g_initialized) {
    heif_deinit();
    g_initialized = false;
  }
}

}  // extern "C"
