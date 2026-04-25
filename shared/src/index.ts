// Shared types, constants, and utilities used across web + mobile + api

export * from './types';
export * from './constants';
export * from './i18n';
// UI primitives are NOT re-exported from the root barrel because they
// pull in react-native at type-resolve time, which would require every
// consumer of @amixos/shared (including the api workspace, which has no
// react-native) to install RN types. Import them via the explicit
// subpath: `import { Button } from '@amixos/shared/ui'`.
