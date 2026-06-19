import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Create a jest object that maps to vi for compatibility
global.jest = {
  fn: vi.fn,
  mock: vi.mock,
  spyOn: vi.spyOn,
  requireActual: vi.importActual,
};

// Also export it if needed by direct import
export const jest = global.jest;
