# 인증

요청, 폴더, 컬렉션마다 인증을 설정할 수 있다. 모든 텍스트 필드가 변수 입력란이라 `{{변수}}`를 쓸 수 있고, 하이라이트와 `{{` 자동완성이 동작한다 ([변수와 환경](variables.md)). Password와 Client Secret도 가려지지 않고 화면에 그대로 보이므로, 값을 직접 쓰기보다 비밀 변수(`{{password}}`)로 참조하는 것을 권장한다.

| 유형 | 동작 |
| --- | --- |
| Inherit | 상위 폴더·컬렉션의 인증을 따른다 (요청·폴더의 기본값) |
| No Auth | 인증 없음 (컬렉션의 기본값) |
| Bearer Token | `Authorization: Bearer <token>` |
| Basic Auth | `Authorization: Basic base64(username:password)` (UTF-8) |
| API Key | 지정한 키·값을 헤더 또는 쿼리 파라미터로 추가 |
| OAuth 2.0 | 토큰을 받아 `Authorization: <prefix> <token>` |

## 상속

요청 → 가장 가까운 폴더 → 바깥 폴더 → 컬렉션 순으로 올라가며 `Inherit`가 아닌 첫 번째 설정을 쓴다. 끝까지 없으면 인증 없음이다.

Headers 탭에 `Authorization` 같은 같은 이름의 헤더를 직접 넣었으면, 인증이 만든 헤더보다 직접 넣은 헤더가 우선한다.

## OAuth 2.0

### 설정 항목

| 항목 | 설명 |
| --- | --- |
| Grant type | Client Credentials 또는 Authorization Code |
| Auth URL | 인가 엔드포인트 (Authorization Code만) |
| Token URL | 토큰 엔드포인트 |
| Client ID / Client Secret | 클라이언트 자격 증명. Secret은 비밀 변수로 두는 것을 권장 |
| Scope | 공백으로 구분 |
| Redirect URI | 비우면 `http://127.0.0.1:<임의 포트>/callback`. 직접 쓸 때는 `127.0.0.1` 또는 `localhost`의 http 주소만 가능 |
| PKCE | Authorization Code에서 PKCE(S256) 사용. 기본으로 켜져 있다 |
| Client auth | 자격 증명을 Basic 헤더로 보낼지, 바디에 넣을지 |
| Header prefix | 기본 `Bearer` |

### 토큰 받기

- **Get New Access Token** 버튼으로 토큰을 받는다. Authorization Code는 시스템 브라우저가 열리고, 로그인 후 로컬 콜백으로 돌아오면 토큰을 교환한다. `state` 값이 다르면 실패 처리한다.
- 받는 동안 버튼에 스피너가 돌고, 성공하거나 실패하면 토스트로 알린다. 실패 내용은 버튼 아래에도 남는다.
- 받은 토큰은 앱 데이터에 저장되어 재시작 후에도 쓴다. 토큰 URL·Client ID·Scope 조합별로 따로 저장된다.
- 토큰이 있으면 **Clear** 버튼이 보이고, 저장된 토큰을 지운다.
- 브라우저 로그인은 2분 안에 콜백이 오지 않으면 실패 처리한다.

### 전송 시 동작

1. 저장된 토큰이 유효하면 그대로 쓴다 (만료 30초 전부터는 만료로 본다). 서버가 `expires_in`을 주지 않았으면 만료되지 않는 것으로 본다.
2. 만료됐고 refresh token이 있으면 자동으로 갱신한다.
3. Client Credentials는 토큰이 없거나 갱신에 실패하면 자동으로 새로 받는다.
4. Authorization Code에 쓸 수 있는 토큰이 없으면, Auth 탭에서 토큰을 받으라는 오류를 낸다.
