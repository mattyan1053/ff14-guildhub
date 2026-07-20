import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // スキャフォールド段階のため。最初のテスト追加後に外す
    passWithNoTests: true,
  },
});
