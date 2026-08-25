import {
  IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE,
  selectSource,
  type ImportPlan,
} from '../assets/importWizard';
import { LociMyuSourceValidationError } from '../io/locimyu';

export type ImportSourceSelectionOutcome =
  | { kind: 'selected' }
  | { kind: 'rejected'; previousIndex: number; message: string }
  | { kind: 'fatal'; previousIndex: number; message: string };

/** UI-only gate that prevents confirming an import while a source change is unresolved. */
export class ImportSourceSelectionController {
  pending = false;
  error: string | null = null;
  private fatalFailure = false;

  get fatal(): boolean {
    return this.fatalFailure;
  }

  get canConfirm(): boolean {
    return !this.pending && !this.fatalFailure;
  }

  get canSelect(): boolean {
    return !this.pending && !this.fatalFailure;
  }

  async select(plan: ImportPlan, index: number): Promise<ImportSourceSelectionOutcome> {
    const previousIndex = plan.selectedSourceIndex;
    if (this.fatalFailure) {
      return {
        kind: 'fatal',
        previousIndex,
        message: this.error ?? IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE,
      };
    }
    if (this.pending) {
      return {
        kind: 'rejected',
        previousIndex,
        message: '別のスプレッドシートを確認中です。完了してからもう一度選んでください。',
      };
    }
    this.pending = true;
    try {
      await selectSource(plan, index);
      this.error = null;
      return { kind: 'selected' };
    } catch (error) {
      if (!(error instanceof LociMyuSourceValidationError)) {
        this.fatalFailure = true;
        this.error = IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE;
        return {
          kind: 'fatal',
          previousIndex,
          message: IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE,
        };
      }
      const message = `選択したスプレッドシートは取り込めません: ${error.message}`;
      this.error = message;
      return { kind: 'rejected', previousIndex, message };
    } finally {
      this.pending = false;
    }
  }
}
