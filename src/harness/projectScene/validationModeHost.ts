import {createValidationModeHost as typedModeHost} from '../../projectScene/validationModeHost';
import {legacyValidationHost} from './validationHost';
export type {ValidationDisplayHost} from '../../projectScene/validationModeHost';
export function createValidationModeHost(...args:Parameters<typeof typedModeHost>){return legacyValidationHost(typedModeHost(...args));}
