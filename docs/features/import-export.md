# Import / Export

컬렉션·폴더·요청을 파일로 내보내고, 파일이나 붙여넣은 텍스트에서 가져온다.

| 형식 | 가져오기 | 내보내기 |
| --- | --- | --- |
| HTTP Tool JSON (`*.httptool.json`) | 컬렉션 → 새 컬렉션 / 폴더·요청 → 열린 컬렉션에 추가 | 컬렉션 · 폴더 · 요청 |
| OpenAPI 3.0 · 3.1 (JSON, YAML) | 새 컬렉션 | 3.0.3 (JSON 또는 YAML) |

cURL 변환은 별도 기능이다 → [cURL 변환](curl.md).

## 내보내기

트리에서 컬렉션·폴더·요청을 우클릭 → **Export…** → 형식을 고르고 **Save…**.

- 내보내는 내용은 디스크에 저장된 상태다. 열린 탭의 저장하지 않은 변경은 들어가지 않는다.
- **HTTP Tool JSON**은 요청, WebSocket, 폴더, 컬렉션(auth, scripts, variables)을 그대로 담는다. 환경과 전역 변수는 담지 않는다.
- **Include secrets**(기본 꺼짐)를 끄면 비밀 변수 값과 인증 정보(Bearer token, Basic password, API Key 값, OAuth 2.0 client secret)를 비운다. 값이 `{{변수}}` 참조면 그대로 둔다. 이 옵션은 HTTP Tool JSON에만 있다. Headers·Cookies에 직접 넣은 값(이름에 auth·token·key·secret·password·session·cookie가 들어간 헤더, 모든 쿠키)은 비우지 않고 대화상자에 경고로 알려준다.
- binary 바디와 form-data 파일 필드는 파일 경로만 담고 파일 내용은 담지 않는다.

### OpenAPI로 내보내기

파일 확장자가 `.yaml`·`.yml`이면 YAML, 그 외는 JSON으로 저장한다. 변수는 값으로 바꾸지 않는다. 자격증명으로 보이는 직접 입력 값(이름에 auth·token·key·secret·password·session·cookie가 들어간 파라미터·헤더·본문 필드, 모든 쿠키, 서버 URL의 `user:pass@`)은 example에서 빼고 경고한다. `{{변수}}` 참조는 그대로 둔다.

| 요청 | OpenAPI |
| --- | --- |
| URL 앞부분 `{{baseUrl}}` 또는 `https://host` | `servers`. 컬렉션 변수에 일반 값이 있으면 그 값, 없으면 `{baseUrl}` 서버 변수 |
| 경로의 `{{id}}` | `{id}` path 파라미터 |
| Params · Headers · Cookies | query · header · cookie 파라미터 (사용 중이면 `required: true`). Content-Type·Authorization 헤더는 제외 |
| Body | `requestBody`. JSON 바디는 example과 추론한 schema |
| 폴더 | 가장 가까운 폴더 이름이 tag |
| 인증 (요청 → 폴더 → 컬렉션 상속 반영) | `securitySchemes`와 `security`. 컬렉션 인증은 전역, 다르면 operation별. No Auth는 `security: []` |

표현할 수 없는 항목은 대화상자에 경고로 보여주고 뺀다: WebSocket 요청, 컬렉션·폴더·요청 스크립트, 요청 Settings, 파일 경로(binary 바디, form-data 파일 필드), 같은 경로+메서드의 두 번째 요청.

폴더나 요청 하나만 내보내도 그 위 폴더들의 인증과 가장 가까운 폴더 이름(tag)을 반영한다.

## 가져오기

사이드바의 **Import** 버튼 → 파일을 고르거나(**Choose file…**) 텍스트를 붙여넣고 **Preview**. 형식은 자동으로 알아낸다. 미리보기에 요청 수와 경고가 나온다.

- **컬렉션**(HTTP Tool 컬렉션 JSON, OpenAPI): 이름을 고친 뒤 **Choose location & Import** → 상위 폴더를 고르면 그 안에 새 컬렉션 폴더를 만들고 연다. 같은 이름의 폴더가 있으면 `이름-2`처럼 붙인다. 가져온 비밀 변수 값은 이 컴퓨터의 비밀 저장소에 들어간다.
- **폴더·요청**(폴더·요청 단위로 내보낸 JSON): 열린 컬렉션이나 폴더를 골라 그 끝에 추가한다. 같은 이름이 있으면 `Get user (2)`처럼 이름을 바꿔 추가하고 기존 항목은 건드리지 않는다.
- 파일 경로가 들어 있는 요청은 다른 컴퓨터에서 파일이 없을 수 있다고 경고한다.
- Pre/Post 스크립트가 들어 있으면 요청을 보낼 때 실행된다고 경고한다. 남이 준 파일이면 스크립트를 먼저 확인한다.

### OpenAPI에서 가져오기

| OpenAPI | 요청 |
| --- | --- |
| `info.title` | 컬렉션 이름 |
| `servers[0].url` (서버 변수는 기본값으로) | 컬렉션 변수 `baseUrl`. 상대 경로(`/api/v3`)면 전체 주소로 고치라고 경고 |
| 경로 `/users/{id}` | URL `{{baseUrl}}/users/{{id}}`, `id`는 컬렉션 변수 (example 값) |
| operation의 첫 번째 tag | 폴더 (tag 없으면 컬렉션 바로 아래) |
| `summary` → `operationId` → `METHOD 경로` | 요청 이름 |
| query · header · cookie 파라미터 | Params · Headers · Cookies (required면 사용, 아니면 꺼둠) |
| `requestBody` | example → examples → schema로 만든 샘플. JSON, urlencoded, multipart(파일 필드), XML, text, binary |
| 전역 `security` | 컬렉션 인증. operation별로 다르면 요청 인증, `security: []`는 No Auth |

인증 값은 `{{token}}`, `{{username}}`/`{{password}}`, `{{apiKey}}`, `{{clientId}}`/`{{clientSecret}}` 변수로 넣고 컬렉션 변수로 만든다(token·password·apiKey·clientSecret은 비밀 변수). 지원하는 방식은 HTTP Bearer, HTTP Basic, API Key(header·query), OAuth 2.0(client credentials, authorization code)이다. 그 밖의 방식은 No Auth로 두고 경고한다.

문서 안의 `$ref`(`#/components/...`)는 따라가고, 순환 참조는 끊는다. schema가 너무 커서 샘플이 지나치게 커지면 일부를 생략하고 경고한다. 다른 파일이나 URL을 가리키는 `$ref`는 빈 schema로 두고 경고한다.

## 범위 밖

Postman 등 다른 도구의 형식, Swagger 2.0, URL에서 가져오기, 환경·전역 변수, 기존 컬렉션에 컬렉션 통째로 합치기, 파일 내용 포함.

## HTTP Tool JSON 형식

```json
{
  "format": "httptool",
  "version": 1,
  "scope": "collection",
  "collection": { "kind": "collection", "name": "API", "auth": { "type": "none" }, "scripts": { "pre": "", "post": "" }, "variables": [] },
  "items": [
    { "kind": "folder", "name": "Users", "seq": 0, "auth": { "type": "inherit" }, "scripts": { "pre": "", "post": "" }, "items": [] },
    { "kind": "http", "name": "Health", "seq": 1, "method": "GET", "url": "{{baseUrl}}/health" }
  ]
}
```

- `scope`: `collection` · `folder` · `request`. `collection`일 때만 `collection`이 있다.
- `items`의 각 항목은 [저장 구조](../storage.md)의 YAML 문서와 같은 필드를 쓰고, 폴더는 하위 항목을 `items`로 담는다. 빠진 필드는 기본값으로 채운다.
- 이 앱보다 높은 `version`은 거부한다.
