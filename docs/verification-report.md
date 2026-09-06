# v0.0.1 実装・検証報告

2026-09-05〜06 のローカル Windows 環境（Node 24.18.1 / Bun 1.4.1）での検証記録。CI の Bun は既存の 1.4.0 固定を維持しています。GitHub Actions の実行結果や npm 公開済みを意味しません。

最終結果: 全 Vitest project は **16ファイル・49テスト成功**。別実行の最小対応 tarball matrix も **8テスト成功**。format、lint、source/test typecheck、sherif、knip（通常・production）、build 内の publint/ATTW、benchmark、`git diff --check` も成功しました。native optional SDK の解決 warning、Vue dependency の非推奨 warning、knip の設定整理ヒントは残っています。

## 1. Contract ID 一覧

51件を [契約一覧](contracts.md) に登録しました。

- META-001
- CFG-001〜007、API-001〜003、TYPE-001〜006
- ENV-001〜004、RUNTIME-001〜003、HOOK-001、ERR-001〜002
- NUXT-001〜002、NITRO-001、DEV-001〜004
- BUNDLE-001〜006、SEC-001〜003、PKG-001〜005
- DOCS-001、REL-001〜002

## 2. Contract → test → blocking job

`docs/contracts.md` を source of truth とし、テスト名または negative case に ID を付けました。unit project が未参照 ID・未登録 ID・存在しない test source/job・`ci-ok` の直接依存漏れを検出します。旧 shell harness 3本を削除し、Vitest の unit／Nuxt4／nightly／Nitro2／Nitro3／consumer／bundle project に移行しました。

## 3. Runtime contracts と共有 integration

Nuxt module と standalone Nitro module は `src/integration/nitro.ts` を共有します。`types:extend` で runtime plugin とプロジェクト別宣言を生成し、public `nuxt-files-sdk/runtime` を拡張します。Windows の import path は `/` に正規化します。旧 context 実装と無条件の Nitro v2 型依存を削除しました。

unknown/ambiguous storage、production の devStorage 非使用、native error の保持、初期化・操作時の暗黙 fallback 不在を検査します。

## 4. Type contracts

named／single default／explicit default／`default` 名の storage、plugin extension、native methods/types、sync/transfer 型を consumer の生成宣言で検査します。unknown storage、誤った adapter、devStorage の plugins/hooks は、実 compiler の失敗と期待する診断コードを確認します。

adapter は native `ProviderSlug`。devStorage は plugins/hooks を `never` とし、runtime でも base の plugins/hooks を保持します。standalone hook 型は Nitro v2/v3 の各 namespace に生成します。Nitro 2.13.0 は `meta` がないため、v3 の routing API の有無を補助判定に使います。

## 5. Concurrency

同一 storage への100並行呼び出しが同じ instance を返し、plugin 初期化が1回だけであることを確認しました。異なる storage の成功と失敗の分離、失敗 Promise の eviction 後の再試行も通過しました。

## 6. Environment と hook failure

native env/alias の優先、provider metadata にない変数の非注入、成功・失敗時の cleanup、同時初期化での注入値消失防止を確認しました。global env を使う既存 bridge は module 内で直列化し、upstream resolver API への置換を TODO としています。user → bridge の hook 順序を維持し、どちらの rejection も native operation result を壊しません。

## 7. Files SDK matrix

packed consumer を `2.3.0` 固定と `^2.3.0` の最新解決で検証します。consumer の override で依存ツリー全体に適用します。今回の両解決は 2.3.0 でした。

## 8. Nuxt / Nitro matrix

| 対象         | 実行した version                        | CI 方針      |
| ------------ | --------------------------------------- | ------------ |
| Nuxt 4       | 4.0.0、4.5.2                            | blocking     |
| Nitro v2     | 2.13.0、2.13.4                          | blocking     |
| Nitro v3     | 3.0.0                                   | blocking     |
| Nuxt nightly | nuxt-nightly の 4.6.0-29803612.ea5d49fb | non-blocking |

`nuxt5` は project/job の名称です。今回 nightly が返した package は上記の4.6 snapshotであり、安定版 Nuxt 5 の検証済みを意味しません。TypeScript は consumer が6系、source が7系で、古い TS の対応保証は追加していません。

## 9. Windows と GitHub CI

ローカル Windows で実 consumer の prepare/typecheck/build/runtime を検証しました。CI に `windows-latest` の Nuxt4 blocking job を追加しました。PR/main の GitHub CI は、この変更をまだ push していないため未確認です。

`changes` は full history を取得し、push の差分検出に対応します。path filter による必須検証の省略をなくし、`ci-ok` がすべての blocking job を直接待ちます。failure/cancelled/skipped は gate を失敗させます。nightly だけ non-blocking です。

## 10. Packed artifact

新しい一時 consumer に actual tarball をインストールし、Nuxt4・Nitro2・Nitro3 で prepare/typecheck/build と実 HTTP route を確認します。最小対応・最新対応の両セットで8テストが通過しました。Nitro-only consumer には Nuxt をインストールしません。

## 11. Package contents

JS／宣言の必須 entry、public exports、依存と optional peer を照合します。公開 entry は root/config/nitro/plugins/runtime/package.json。tarball は dist と公開 metadata のみに制限し、source/test/private config/local data を拒否します。publint と ATTW もその tarball 自体を検査します。

## 12. Bundle

未使用 Vue、production DevFrame、standalone の Nuxt Kit を除外します。fs-only output に AWS/Azure/Google SDK package がないことを確認しました。native Nitro の inline 設定で両 package を tree-shaking 対象にし、versioning-only consumer から他の plugin entry と実装 marker が消えることも検査します。

実測は Nuxt server 2,812,818 bytes／public 178,382 bytes、Nitro server 1,013,743 bytes。Nuxt の初期 ceiling は3,500,000／250,000 bytesです。これは fixture 全体であり、package 単体の寄与ではありません。

## 13. Secret leakage

fixture の明示的なダミー secret を、production output・生成 plugin/宣言・tarball・成功した build log で検索し、不在を確認しました。secret を含む config を snapshot に渡す unit test は、許可した metadata だけが返ることを exact object で検査します。

## 14. DevFrame

単一の definition と UI、共通の安全な snapshot を実装しました。v3 は iframe、v4 は native `createEmbedded` と dock host に登録します。production／module opt-out／Nuxt DevTools 無効時は登録しません。実 Nuxt dev server で UI と初期化済み registry の snapshot を確認しました。snapshot は build host ではなく Nitro worker 内で実行します。生成 plugin/config は dev でも inline にし、native Files SDK loader は dev のみ外部に保って provider SDK の eager import を防ぎます。ブラウザー内の完全な操作テストは保証対象外です。

v4 の dock 登録は [公式の native host API](https://devtools.nuxt.com/module/utils-kit#ondevtoolsready) に対応しています。

## 15. Docs compile

README の canonical TypeScript 3 snippet を抽出し、native public type fixture とともに生成宣言で compile します。同じ検証を actual tarball consumer でも実行しました。指定どおり `content/` は作成していません。

## 16. Exact artifact release

既存の uppt release flow を維持しました。tagged SHA の push CI と `ci-ok` 成功を確認し、`uppt/pack` の tarball を `NUXT_FILES_TARBALL` で consumer tests に渡します。この経路では再 build しません。検査前後の SHA-256 が不変であり、pack-and-verify 成功後だけ publish job がアップロード済みの同じ artifact を取得します。release 自体は実行していません。

## 17. CI green が保証する範囲

登録済み契約の source/runtime/type/artifact/bundle/security boundary と、定義した対応 matrix に対する release 候補判定です。format、lint、typecheck、workspace dependency check、knip、unit、integration、packed consumer、bundle、benchmark がすべて blocking です。

## 18. 保証しない範囲

実 cloud account の認証・ネットワーク、全 deploy preset、アプリ固有の認可、未知の upstream 変更、完全な GUI 操作、安定版 Nuxt5 は保証しません。coverage 100% や全 provider 実装の除去も主張しません。base/head の size 比較、macOS matrix、全体 mutation framework は追加していません。

## 19. Dependencies と upstream TODO

- runtime dependency に `devframe` を追加。`@nuxt/kit` と `files-sdk` は維持。cloud SDK や独自 provider registry は追加していません。
- Ponytail 方針に沿って既存 Nitro API と native Files SDK を再利用し、provider 別の独自実装や UI framework は増やしていません。
- Vitest を workspace に集約し、`@nuxt/test-utils` を追加。root tests が直接使う schema/files-sdk/TypeScript を明示しました。
- Nitro v3 fixture では、upstream 宣言が参照する `hookable` を devDependency に補っています。
- native loader の provider option 型と injectable env resolver を upstream 待ちとしています。module の lock は無関係なコードの process.env mutation までは保護しません。
- native loader は未使用 provider chunk/optional import metadata を保持します。欠けた optional SDK の build warning は残りますが、fs runtime と出力境界は検査済みです。

## 20. Release 前に残ること

この変更のレビュー・commit/push 後に、PR と main の GitHub CI が実際に green であることを確認する必要があります。npm environment/OIDC 設定と初回 release workflow の実行も未確認です。File Explorer、gateway convenience、Vue UI component、MCP、advanced telemetry は今回の指定範囲外です。
