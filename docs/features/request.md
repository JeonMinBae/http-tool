# 요청 편집

## URL 바

- 메서드: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- URL에 `{{변수}}`를 쓸 수 있다. 변수는 색으로 표시되고, 마우스를 올리면 현재 값과 출처 스코프가 보인다.
- 탭 바의 `+` 버튼이나 ⌘N으로 새 요청을 만들고, Save 버튼이나 ⌘S로 저장한다.
- 스킴을 생략하면 `http://`를 붙여 보낸다.
- URL 입력란에 `curl ...` 명령을 붙여넣으면 cURL로 인식해 요청 전체를 채운다. [cURL 변환](curl.md)
- Send(또는 Enter)로 전송하고, 전송 중에는 Cancel로 취소한다.
- 보낸 요청에 해석되지 않은 변수가 있었으면 응답 위에 경고가 표시된다.

## 편집 탭

| 탭 | 내용 |
| --- | --- |
| Params | 쿼리 파라미터 표. URL과 양방향으로 동기화된다 |
| Headers | 헤더 표 |
| Body | 바디 유형별 입력 |
| Auth | 인증. [인증](auth.md) |
| Cookies | 이 요청에만 붙일 쿠키 |
| Scripts | Pre-request / Post-response 스크립트. [스크립트](scripts.md) |
| Settings | 이 요청에만 적용할 네트워크 설정 |

값이 있는 탭에는 개수나 `●`가 표시된다.

### 키-값 표 (Params, Headers, Cookies, Body의 form 필드)

- 행마다 체크박스로 켜고 끌 수 있다. 꺼진 행은 저장되지만 전송되지 않는다.
- 마지막 빈 행에 입력하면 새 행이 생긴다.
- **Bulk Edit**: 한 줄에 `key: value` 형식으로 한꺼번에 편집한다. `//`로 시작하는 줄은 꺼진 행이다.
- 키와 값 모두 `{{변수}}`를 쓸 수 있다.

### Body

| 유형 | 설명 | 자동 Content-Type |
| --- | --- | --- |
| none | 바디 없음 | — |
| form-data | 텍스트/파일 필드. 파일은 경로를 골라 지정 | multipart 경계 포함 (전송 시 생성) |
| x-www-form-urlencoded | 키-값 필드 | `application/x-www-form-urlencoded` |
| raw | JSON / Text / XML / HTML 편집기 (문법 강조) | 언어별 (`application/json` 등) |
| binary | 파일 하나를 그대로 전송 | — |
| GraphQL | Query와 Variables(JSON) 편집기 | `application/json` |

raw, GraphQL, x-www-form-urlencoded는 Headers에 `Content-Type`을 직접 넣으면 자동 값 대신 그 값을 쓴다. form-data는 경계값이 필요하므로 `Content-Type`을 직접 넣지 않는다 (넣으면 헤더가 두 개 나간다).

raw JSON은 Beautify 버튼으로 정렬할 수 있다.

### Cookies

여기 넣은 쿠키는 `Cookie` 헤더 하나로 합쳐져 이 요청에만 붙는다. **이 탭에 쿠키가 하나라도 있으면 쿠키 저장소의 쿠키는 붙지 않는다** (직접 넣은 `Cookie` 헤더와 같은 취급). Headers에도 `Cookie`를 넣으면 헤더가 두 개 나가니 한 곳만 쓴다. 앱 전역 쿠키 저장소는 [쿠키](cookies.md).

### Settings

요청별로 전역 설정을 덮어쓴다. 비워 두면 전역 값을 따른다.

- Timeout (ms)
- Follow redirects (기본 / 켬 / 끔)
- Verify SSL certificates (기본 / 켬 / 끔)

## 전송 시 자동 처리

- `User-Agent`(`HttpTool/<버전>`), `Accept`(`*/*`) 헤더가 없으면 기본값을 붙인다.
- `Accept-Encoding`을 직접 넣지 않으면 gzip, deflate, br 압축 응답을 받아 자동으로 푼다. 직접 넣으면 압축된 본문을 그대로 보여준다.
- 리다이렉트는 최대 10번 따라가고, 각 단계는 응답 상단에 표시된다. 10번을 넘으면 마지막 3xx 응답을 그대로 보여준다.
- 301/302/303은 GET으로 바꾸고 바디와 `Content-Type`을 뗀다. 그 밖의 리다이렉트(307/308)는 메서드와 바디를 유지한다.
- 다른 오리진으로 리다이렉트되면 `Authorization` 헤더를 떼고 보낸다.
- 쿠키 저장소의 쿠키를 붙이고, 응답의 `Set-Cookie`를 저장소에 반영한다. 요청에 `Cookie` 헤더가 있으면(Headers 또는 Cookies 탭) 저장소 쿠키는 붙이지 않는다.
