import { isDeepStrictEqual } from 'node:util';

type DescriptorSnapshot = Map<PropertyKey, PropertyDescriptor>;

export interface ObjectIntrinsicSnapshot {
  constructorDescriptors: DescriptorSnapshot;
  constructorPrototype: object | null;
  prototypeDescriptors: DescriptorSnapshot;
  prototypePrototype: object | null;
}

function snapshotDescriptors(target: object): DescriptorSnapshot {
  return new Map(
    Reflect.ownKeys(target).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(target, key)!,
    ]),
  );
}

function descriptorsMatch(target: object, snapshot: DescriptorSnapshot): boolean {
  const currentKeys = Reflect.ownKeys(target);
  if (currentKeys.length !== snapshot.size) return false;
  return currentKeys.every((key) => {
    const expected = snapshot.get(key);
    const actual = Object.getOwnPropertyDescriptor(target, key);
    return expected !== undefined && actual !== undefined && isDeepStrictEqual(actual, expected);
  });
}

function restoreDescriptors(target: object, snapshot: DescriptorSnapshot): void {
  for (const key of Reflect.ownKeys(target)) {
    if (!snapshot.has(key) && !Reflect.deleteProperty(target, key)) {
      throw new Error('failed to remove an unexpected Object intrinsic property');
    }
  }
  for (const [key, descriptor] of snapshot) {
    Object.defineProperty(target, key, descriptor);
  }
}

export function snapshotObjectIntrinsics(): ObjectIntrinsicSnapshot {
  return {
    constructorDescriptors: snapshotDescriptors(Object),
    constructorPrototype: Object.getPrototypeOf(Object),
    prototypeDescriptors: snapshotDescriptors(Object.prototype),
    prototypePrototype: Object.getPrototypeOf(Object.prototype),
  };
}

export function objectIntrinsicsMatch(snapshot: ObjectIntrinsicSnapshot): boolean {
  return (
    Object.getPrototypeOf(Object) === snapshot.constructorPrototype &&
    Object.getPrototypeOf(Object.prototype) === snapshot.prototypePrototype &&
    descriptorsMatch(Object, snapshot.constructorDescriptors) &&
    descriptorsMatch(Object.prototype, snapshot.prototypeDescriptors)
  );
}

export function restoreObjectIntrinsics(snapshot: ObjectIntrinsicSnapshot): void {
  if (!Reflect.setPrototypeOf(Object, snapshot.constructorPrototype)) {
    throw new Error('failed to restore Object prototype link');
  }
  if (!Reflect.setPrototypeOf(Object.prototype, snapshot.prototypePrototype)) {
    throw new Error('failed to restore Object.prototype prototype link');
  }
  restoreDescriptors(Object, snapshot.constructorDescriptors);
  restoreDescriptors(Object.prototype, snapshot.prototypeDescriptors);
}
