module.exports = {
  preset: 'ts-jest', testEnvironment: 'node', rootDir: 'test', testRegex: '.*\\.e2e-spec\\.ts$', testTimeout: 60000,
  globalSetup: '<rootDir>/global-setup.ts', setupFiles: ['<rootDir>/setup-env.ts'],
};
