# 아키텍처

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 데스크톱 셸 | Tauri 2 (Rust). 시스템 WebView 사용 — macOS는 WKWebView, Windows는 WebView2 |
| 프론트엔드 | React 19, TypeScript, Vite, Tailwind CSS v4 |
| 상태 관리 | zustand |
| 편집기 | CodeMirror 6 (`@uiw/react-codemirror`) |
| 레이아웃 | react-resizable-panels |
| HTTP | reqwest 0.12 (rustls, OS 루트 인증서), cookie_store |
| WebSocket | tokio-tungstenite |
| 스크립트 | Web Worker + chai, crypto-js, lodash 번들 |
| 테스트 | Vitest (TS), cargo test (Rust) |

Electron 대신 Tauri를 쓴 이유는 설치 파일과 메모리 사용량을 작게 유지하기 위해서다. macOS 앱 번들은 약 7MB, dmg는 약 4MB다.

## 디렉토리 구성

```
src/                    프론트엔드
  core/                 순수 로직. UI·Tauri에 의존하지 않아 단위 테스트 대상
    model.ts            요청·폴더·컬렉션·변수·설정 타입
    yaml.ts             YAML ↔ 모델 변환 (알 수 없는 값은 기본값으로 보정)
    collectionRepo.ts   컬렉션 폴더 읽기/쓰기, 파일명 생성, 정렬
    variables.ts        변수 스코프 해석, {{var}} 치환
    prepare.ts          요청 → 실제 전송할 형태(PreparedRequest)로 변환
    auth.ts             인증 상속 해석과 헤더/쿼리 적용
    oauth2.ts           OAuth 2.0 토큰 발급·갱신
    execute.ts          스크립트 → 전송 → 스크립트 → 변수 저장 → 히스토리 전체 흐름
    curl/               cURL 가져오기(tokenize, import)와 내보내기(export)
    runner.ts, sse.ts, search.ts, responseFormat.ts, ...
  script/               스크립트 샌드박스 (Worker, pm API)
  state/                zustand 스토어 (workspace, tabs, variables, settings, history, ...)
  ui/                   React 컴포넌트 (기능별 하위 폴더)
  ipc.ts                Tauri 명령 호출 래퍼. 프론트엔드에서 Rust로 가는 유일한 통로
src-tauri/              Rust 백엔드
  src/lib.rs            플러그인·상태 등록, 명령 목록
  src/fs_commands.rs    컬렉션 파일 접근 (열린 컬렉션 루트 밖은 차단)
  src/appdata.rs        앱 데이터 JSON 읽기/쓰기 (허용된 이름만)
  src/http/             HTTP 전송(client.rs), 스트리밍(stream.rs), 타입(types.rs)
  src/cookies.rs        앱 전역 쿠키 저장소
  src/history.rs        히스토리 저장
  src/oauth.rs          OAuth 콜백용 로컬 리스너
  src/ws.rs             WebSocket 연결
  src/files.rs          응답 본문 파일 저장
scripts/make-dmg.sh     Finder 자동화 없이 dmg 생성
```

## 역할 분담

**프론트엔드(TS)가 하는 일:** 요청 편집, 변수 치환, 인증 상속 해석, 바디 변환, 스크립트 실행, cURL 변환, OAuth 흐름 제어. 요청은 프론트엔드에서 완전히 "준비된" 형태(`PreparedRequest`)가 된 뒤 Rust로 넘어간다.

**Rust가 하는 일:** 브라우저 제약(CORS, 금지 헤더, 쿠키 접근)이 없는 실제 네트워크 전송, 파일 시스템 접근, 쿠키 저장소, 히스토리 저장, OAuth 콜백 리스너, WebSocket.

이렇게 나눈 이유는 로직 대부분을 테스트하기 쉬운 순수 TS 함수로 두고, Rust는 OS·네트워크 경계에만 두기 위해서다.

## 요청 한 번의 흐름

`core/execute.ts`의 `executeDoc()`:

1. 컬렉션 → 폴더(바깥→안쪽) → 요청 순으로 Pre-request 스크립트 실행. 스크립트가 요청과 변수를 바꿀 수 있다.
2. 인증 해석. OAuth 2.0이면 캐시된 토큰을 쓰거나 갱신·발급한다.
3. `prepareRequest()` — 변수 치환, 인증 적용, 바디 변환, 설정 병합.
4. Rust `http_send`로 전송. 리다이렉트를 직접 따라가며 각 단계를 기록하고, 쿠키 저장소를 읽고 쓴다.
5. Post-response 스크립트를 같은 순서로 실행 (이벤트 스트림 응답은 생략).
6. 스크립트가 바꾼 환경·컬렉션·전역 변수를 저장. 지역 변수는 버린다.
7. 콘솔과 히스토리에 기록.

## IPC 명령

`src-tauri/src/lib.rs`에 등록된 29개 명령. 프론트엔드는 `src/ipc.ts`를 통해서만 호출한다.

| 그룹 | 명령 |
| --- | --- |
| 컬렉션 파일 | `collection_register`, `collection_unregister`, `fs_read_tree`, `fs_read_file`, `fs_write_file`, `fs_create_dir`, `fs_rename`, `fs_copy`, `fs_delete` |
| 앱 데이터 | `appdata_read`, `appdata_write` |
| HTTP | `http_send`, `stream_cancel` |
| 쿠키 | `cookie_list`, `cookie_upsert`, `cookie_delete`, `cookie_clear` |
| 히스토리 | `history_append`, `history_list`, `history_get`, `history_clear` |
| OAuth | `oauth_listen`, `oauth_wait` |
| WebSocket | `ws_connect`, `ws_send`, `ws_close` |
| 파일 | `file_save_base64`, `file_read_text`, `dir_create_unique` |

이 밖에 Tauri 플러그인 `dialog`(폴더·파일 선택)와 `opener`(시스템 브라우저 열기)를 쓴다.

## 보안 경계

- 컬렉션 파일 명령은 `collection_register`로 등록된 컬렉션 루트 안의 경로만 허용하고, 루트 자체의 삭제·이름 변경은 막는다.
- 파일 그룹 명령(`file_*`, `dir_create_unique`)은 사용자가 대화상자로 고른 경로에만 쓰인다. `dir_create_unique`는 경로 구분자나 `..`가 든 이름을 거부하고 기존 폴더를 덮어쓰지 않는다.
- 앱 데이터는 정해진 이름(`globals`, `environments`, `settings`, `workspace`, `oauth-tokens`, `secrets/<sha256>`)만 읽고 쓸 수 있다.
- 사용자 스크립트는 Worker 안에서 실행되며 `fetch`, `XMLHttpRequest`, `WebSocket`, Tauri 객체 등에 접근할 수 없다. 자세한 내용은 [스크립트](features/scripts.md).
- HTML 응답 미리보기는 `sandbox=""` iframe에서 스크립트 없이 렌더링한다.
