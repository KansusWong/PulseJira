/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup-env.js'],
  roots: ['<rootDir>/lib'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^server-only$': '<rootDir>/lib/core/__tests__/__mocks__/server-only.js',
  },
  transformIgnorePatterns: ['/node_modules/'],
};
