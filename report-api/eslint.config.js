"use strict";

module.exports = [
  {
    files: ["src/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        URL: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", {"argsIgnorePattern": "^_"}],
      "no-constant-condition": "error",
      "no-eval": "error"
    }
  }
];
