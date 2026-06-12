/** Unit tests — colocated *.spec.ts under src/. E2E lives in test/ (own config). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['**/*.ts', '!main.ts'],
  coverageDirectory: '../coverage',
};
