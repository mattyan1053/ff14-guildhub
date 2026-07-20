/**
 * ADR 0003のレイヤー境界を機械的に強制する。
 * 層: discord (Interface) / application / domain / infrastructure / config
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-no-discordjs",
      comment:
        "ドメイン層・アプリケーション層はdiscord.jsの型に依存しない(ADR 0003)",
      severity: "error",
      from: { path: "^src/(domain|application)" },
      to: { path: "node_modules/(discord\\.js|@discordjs)" },
    },
    {
      name: "domain-depends-on-nothing",
      comment: "ドメイン層は他の層に依存しない",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^src/(application|infrastructure|discord|config)" },
    },
    {
      name: "application-no-outer-layers",
      comment:
        "アプリケーション層はPorts経由で外側を使う。実装やInterface層に直接依存しない",
      severity: "error",
      from: { path: "^src/application" },
      to: { path: "^src/(discord|infrastructure)" },
    },
    {
      name: "db-libs-only-in-infrastructure",
      comment: "DBライブラリへの依存はInfrastructure層に閉じる",
      severity: "error",
      from: { path: "^src", pathNot: "^src/infrastructure" },
      to: { path: "node_modules/(kysely|better-sqlite3)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // TypeScript 7(ネイティブ版)のAPIにdependency-cruiserが未対応のため、
    // tscではなくswcでパースする
    parser: "swc",
  },
};
