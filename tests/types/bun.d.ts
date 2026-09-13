declare module "bun" {
  export interface SQL {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    unsafe(query: string): Promise<unknown>;
    end(): Promise<void>;
  }

  export const SQL: {
    new (url: string, options?: { max?: number }): SQL;
  };
}

declare module "bun:test" {
  type Hook = () => void | Promise<void>;
  type TestBody = () => void | Promise<void>;

  interface SuiteFunction {
    (name: string, body: TestBody): void;
    skip(name: string, body: TestBody): void;
  }

  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
  }

  export const describe: SuiteFunction;
  export const test: (name: string, body: TestBody) => void;
  export const beforeAll: (hook: Hook) => void;
  export const afterAll: (hook: Hook) => void;
  export const expect: (value: unknown) => Matchers;
}
