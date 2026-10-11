# 개발과 빌드

## 준비물

- Node.js (LTS)
- Rust (stable) — `rustup`으로 설치
- Windows: MSVC Build Tools, WebView2 런타임 (Windows 10/11에는 보통 설치되어 있음)

## 명령

| 명령 | 설명 |
| --- | --- |
| `npm install` | 의존성 설치 |
| `npm run tauri dev` | 개발 모드로 앱 실행 (프론트엔드 핫 리로드) |
| `npm test` | 프론트엔드 단위 테스트 (Vitest) |
| `npm run test:rust` | Rust 단위 테스트 |
| `npm run build` | 타입 체크 + 프론트엔드 빌드 |
| `npm run tauri build` | 배포용 설치 파일 빌드 |

## 설치 파일

**macOS**

- `npm run tauri build` → `src-tauri/target/release/bundle/dmg/*.dmg`
- dmg 단계는 Finder를 AppleScript로 조작한다. 자동화 권한이 없어 실패하면 `sh scripts/make-dmg.sh`를 쓴다. `.app`만 빌드한 뒤 `hdiutil`로 단순한 dmg를 만든다.
- 앱 번들만 필요하면 `src-tauri/target/release/bundle/macos/HTTP Tool.app`을 쓴다.

**Windows**

- Windows에서 `npm run tauri build` → `src-tauri/target/release/bundle/msi/*.msi`
- Tauri는 크로스 빌드를 지원하지 않으므로 Windows 설치 파일은 Windows에서 빌드해야 한다.

코드 서명은 하지 않는다. 다른 Mac에서 처음 열 때 경고가 나오면 우클릭 → 열기로 실행한다.

## 아이콘

`src-tauri/icons/`의 아이콘은 Tauri 템플릿 기본 로고다. 바꾸려면 1024×1024 PNG를 준비해 `npx tauri icon <파일>`을 실행한다.

## 테스트 범위

- `src/core/**/*.test.ts` — 변수 치환, YAML 변환, 요청 준비, 인증, OAuth(PKCE 포함), cURL 변환, 러너, SSE 파서, 검색 등 순수 로직
- `src/script/pmApi.test.ts` — `pm` API와 샌드박스 차단
- `src/state/*.test.ts` — 탭·워크스페이스 상태
- `src-tauri/src/**` — 경로 차단, 앱 데이터 이름 검증, HTTP 전송·리다이렉트·쿠키, 히스토리, OAuth 리스너, WebSocket

UI는 자동 테스트가 없다. 화면을 바꿨다면 `npm run tauri dev`로 직접 확인한다.

## 코드 규칙

- `src/core`는 React·zustand·Tauri 런타임을 import하지 않는다. `ipc.ts`의 타입만 가져다 쓰고, 파일 접근 같은 의존성은 인자로 받는다. 예외는 `execute.ts`로, 스토어와 IPC를 엮는 조립 지점이다.
- 프론트엔드에서 Rust 호출은 `src/ipc.ts`에만 둔다. 새 명령을 추가하면 Rust의 `lib.rs` 등록과 `ipc.ts` 래퍼를 함께 고친다. Rust 인자는 snake_case로 쓰고, TS에서는 camelCase로 넘긴다.
- `tauri.conf.json`의 `dragDropEnabled`는 `false`여야 한다. `true`면 Tauri가 OS 파일 드롭을 처리하느라 WebView의 HTML5 드래그앤드롭을 가로채서, 사이드바 트리의 드래그 이동이 동작하지 않는다.
