# HTTP Tool 문서

macOS와 Windows에서 동작하는 가벼운 HTTP 클라이언트다. Postman·Apidog와 비슷한 화면을 갖되, 필요한 기능만 남겨 가볍게 쓰고 직접 고쳐 쓰는 것을 목표로 한다.

## 구성

- [아키텍처](architecture.md) — 기술 스택, 디렉토리 구성, 프론트엔드와 Rust 백엔드의 역할 분담, IPC 명령
- [저장 구조](storage.md) — 컬렉션 YAML 파일 형식과 앱 데이터 파일
- [개발과 빌드](development.md) — 실행, 테스트, 패키징

## 기능별 설명

| 문서 | 내용 |
| --- | --- |
| [화면 구성](features/ui.md) | 레이아웃, 사이드바, 탭, 단축키, 콘솔 |
| [컬렉션과 폴더](features/collections.md) | 폴더 기반 요청 저장, 트리 조작 |
| [요청 편집](features/request.md) | URL, Params, Headers, Body, Cookies, Settings |
| [인증](features/auth.md) | Bearer, Basic, API Key, OAuth 2.0, 상속 |
| [변수와 환경](features/variables.md) | 4단계 변수 스코프, 목록형 변수, 환경 전환, 비밀 변수 |
| [스크립트](features/scripts.md) | Pre/Post 스크립트, `pm` API, 샌드박스 |
| [응답 보기](features/response.md) | Body, Headers, Cookies, 보낸 요청, Tests |
| [cURL 변환](features/curl.md) | 가져오기와 내보내기 (bash, cmd, PowerShell) |
| [Import / Export](features/import-export.md) | HTTP Tool JSON, OpenAPI 3.x 가져오기·내보내기 |
| [쿠키](features/cookies.md) | 앱 전역 쿠키 저장소와 관리 화면 |
| [히스토리](features/history.md) | 보낸 요청 기록 |
| [네트워크 설정](features/settings.md) | 타임아웃, 리다이렉트, SSL, 프록시 |
| [검색](features/search.md) | 사이드바 검색 (요청 트리 필터, 변수 검색), ⌘K |
| [컬렉션 러너](features/runner.md) | 폴더·컬렉션 일괄 실행 |
| [SSE와 WebSocket](features/streaming.md) | 이벤트 스트림, WebSocket 요청 |

## 범위 밖

gRPC, 클라우드 동기화·팀 공유, 자동 업데이트, 코드 서명은 포함하지 않는다. UI는 영어이고, 다크/라이트 테마는 시스템 설정을 따른다.
