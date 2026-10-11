# HTTP Tool

macOS·Windows용 가벼운 HTTP 클라이언트. Postman·Apidog와 비슷한 화면에 필요한 기능만 담았다 — 요청 편집·저장(폴더 기반 YAML), 변수·환경, Pre/Post 스크립트(`pm` API), OAuth 2.0, cURL 변환, 컬렉션 러너, SSE·WebSocket.

## 기술 스택

Tauri 2 (Rust) · React 19 + TypeScript · Vite · Tailwind CSS v4 · zustand · CodeMirror 6 · reqwest · tokio-tungstenite · Vitest

→ 선택 이유와 역할 분담: [docs/architecture.md](docs/architecture.md)

## 프로젝트 구조

```
src/core/      순수 로직 (변수, 요청 준비, 인증, cURL, 러너 …) — 단위 테스트 대상
src/script/    스크립트 샌드박스 (Web Worker, pm API)
src/state/     zustand 스토어
src/ui/        React 컴포넌트 (기능별 폴더)
src/ipc.ts     Rust 명령 호출 래퍼 (프론트엔드 → Rust의 유일한 통로)
src-tauri/src/ Rust 백엔드: HTTP 전송, 파일·앱 데이터, 쿠키, 히스토리, OAuth, WebSocket
scripts/       빌드 보조 스크립트
docs/          문서
```

→ 디렉토리별 상세, 요청 흐름, IPC 명령 목록: [docs/architecture.md](docs/architecture.md) · 저장 파일 형식: [docs/storage.md](docs/storage.md)

## 개발과 빌드

| 명령 | 용도 |
| --- | --- |
| `npm run tauri dev` | 앱 실행 (개발 모드) |
| `npm test` / `npm run test:rust` | TS / Rust 단위 테스트 |
| `npx tsc --noEmit` | 타입 체크 |

- **macOS:** `npm run tauri build` → `src-tauri/target/release/bundle/dmg/*.dmg`. dmg 단계가 실패하면 `sh scripts/make-dmg.sh`
- **Windows:** Windows에서 `npm run tauri build` → `src-tauri/target/release/bundle/msi/*.msi` (MSVC Build Tools, WebView2 필요. 크로스 빌드 불가)

→ 준비물, 테스트 범위, 코드 규칙: [docs/development.md](docs/development.md)

## 문서 인덱스

전체 목차: [docs/README.md](docs/README.md)

| 문서 | 요약 |
| --- | --- |
| [architecture](docs/architecture.md) | 스택, 디렉토리, TS/Rust 역할, 요청 흐름, IPC, 보안 경계 |
| [storage](docs/storage.md) | 컬렉션 YAML 형식, 비밀 변수, 앱 데이터 위치 |
| [development](docs/development.md) | 실행·테스트·빌드, 코드 규칙 |
| [features/ui](docs/features/ui.md) | 레이아웃, 탭, 단축키, 콘솔 |
| [features/collections](docs/features/collections.md) | 컬렉션 열기, 트리 조작, 저장 |
| [features/request](docs/features/request.md) | Params·Headers·Body·Cookies·Settings, 전송 시 자동 처리 |
| [features/auth](docs/features/auth.md) | 인증 유형, 상속, OAuth 2.0 |
| [features/variables](docs/features/variables.md) | 변수 스코프 우선순위, 환경, 비밀 변수 |
| [features/scripts](docs/features/scripts.md) | 실행 순서, `pm` API, 샌드박스 |
| [features/response](docs/features/response.md) | Body 보기 방식, 보낸 요청 확인 |
| [features/curl](docs/features/curl.md) | cURL 가져오기 옵션, 내보내기 |
| [features/cookies](docs/features/cookies.md) | 전역 쿠키 저장소, 관리 화면 |
| [features/history](docs/features/history.md) | 기록·보관 규칙 |
| [features/settings](docs/features/settings.md) | 타임아웃, 리다이렉트, SSL, 프록시 |
| [features/search](docs/features/search.md) | ⌘K 검색 |
| [features/runner](docs/features/runner.md) | 컬렉션 러너 |
| [features/streaming](docs/features/streaming.md) | SSE, WebSocket |

동작을 바꾸면 해당 문서도 함께 고친다.
