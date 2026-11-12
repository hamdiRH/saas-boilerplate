import { faker } from '@faker-js/faker';

// deterministic data → reproducible test failures
faker.seed(42);

export { faker } from '@faker-js/faker';

/** Tiny factory helper: `build(overrides)` returns a fully-typed object. */
const defineFactory = <T>(make: (sequence: number) => T) => {
  let sequence = 0;

  return {
    build: (overrides: Partial<T> = {}): T => ({ ...make((sequence += 1)), ...overrides }),
  };
};

export { defineFactory };
