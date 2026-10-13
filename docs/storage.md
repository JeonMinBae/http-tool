# 저장 구조

데이터는 두 곳에 나뉘어 저장된다.

- **컬렉션 폴더** — 사용자가 고른 폴더. 요청 정의가 들어 있고, git 등으로 공유할 수 있다.
- **앱 데이터 폴더** — 이 PC에만 있는 데이터. 전역 변수, 환경, 설정, 히스토리, 쿠키, 비밀 값.

## 컬렉션 폴더

컬렉션은 디스크의 폴더 하나다. 여러 컬렉션을 동시에 열 수 있다.

```
my-api/                     컬렉션 루트
  collection.yaml           컬렉션 설정 (이름, 인증, 스크립트, 변수)
  login.yaml                요청 1개 = 파일 1개
  users/                    폴더
    _folder.yaml            폴더 설정 (이름, 순서, 인증, 스크립트)
    list-users.yaml
    get-user.yaml
  chat.yaml                 WebSocket 요청도 같은 방식
```

- 이름이 `.`으로 시작하는 파일·폴더는 무시한다.
- `collection.yaml`이 없는 폴더를 열면 새로 만든다.
- 파일 이름은 요청 이름에서 만들고, 겹치면 `-2`, `-3`을 붙인다. 화면에 보이는 이름은 파일 안의 `name`이다.
- 트리 순서는 각 문서의 `seq` 값 순이고, 같으면 이름 순이다. 드래그로 순서를 바꾸면 `seq`가 다시 매겨진다.
- YAML 문법 오류나 `kind`가 맞지 않는 요청 파일은 트리에서 빠지고 오류로 표시되며, 나머지는 정상적으로 열린다. `_folder.yaml`이 깨지면 그 폴더 전체가 빠진다.
- UTF-8이 아니거나 읽기 권한이 없는 파일이 있으면 컬렉션 전체를 열지 못한다.
- 확장자는 `.yaml`만 읽는다 (`.yml`은 무시).

### 요청 파일 예시

```yaml
kind: http
name: Create user
seq: 2
method: POST
url: "{{baseUrl}}/users/{id}"
params: []
pathParams:
  - key: id
    value: "42"
    description: 사용자 ID
headers:
  - key: X-Trace
    value: "1"
    enabled: true
cookies: []
body:
  type: raw
  language: json
  content: |
    { "name": "kim" }
auth:
  type: inherit
scripts:
  pre: ""
  post: |
    pm.test("created", () => pm.response.to.have.status(201));
settings: {}
```

`pathParams`는 URL 경로의 `{이름}`에 채운 값이다. 저장할 때 URL에 있는 이름만 URL 순서대로 남기고, 필드가 없는 예전 파일은 빈 목록으로 읽는다. [경로 파라미터](features/request.md#경로-파라미터-path-params)

`kind`는 `http`, `websocket`, `folder`, `collection` 중 하나이며, 없거나 맞지 않으면 읽기 오류다. 그 밖의 필드가 빠졌거나 값이 잘못됐으면 읽을 때 기본값으로 보정한다.

### 변수

`collection.yaml`의 `variables` 항목은 일반 변수와 목록형 변수 두 형태다. 목록형은 `value` 대신 `type: list`와 `items`를 가진다.

```yaml
variables:
  - key: baseUrl
    value: https://api.example.com
    enabled: true
    secret: false
  - key: tool
    type: list
    enabled: true
    secret: false
    items:
      - key: A
        value: alpha
        enabled: true
```

`type`이 없으면 일반 변수다. 환경·전역 변수(`environments.json`, `globals.json`)도 같은 형태다.

### 비밀 변수

컬렉션 변수에 `secret: true`를 켜면 값은 `collection.yaml`에 빈 문자열로 저장되고, 실제 값은 앱 데이터의 `secrets/<컬렉션 경로의 sha256>.json`에 저장된다. 컬렉션 폴더를 공유해도 토큰·비밀번호가 함께 나가지 않는다.

목록형 변수가 secret이면 항목 값이 같은 파일에 `목록:항목` 키로 저장된다 (예: `tool:A`). 일반 변수 이름에는 `:`를 쓸 수 없어 키가 겹치지 않는다.

## 앱 데이터 폴더

위치는 Tauri의 `app_data_dir` (식별자 `dev.local.httptool`).

- macOS: `~/Library/Application Support/dev.local.httptool/`
- Windows: `%APPDATA%\dev.local.httptool\`

| 파일 | 내용 |
| --- | --- |
| `globals.json` | 전역 변수 |
| `environments.json` | 환경 목록과 변수, 선택된 환경 |
| `settings.json` | 네트워크 설정 |
| `workspace.json` | 열려 있는 컬렉션 목록 (재시작 시 복원) |
| `oauth-tokens.json` | OAuth 2.0 토큰 캐시 |
| `secrets/<hash>.json` | 컬렉션별 비밀 변수 값 |
| `cookies.json` | 쿠키 저장소 |
| `history/` | 히스토리 인덱스와 항목별 파일 |

JSON 파일은 임시 파일에 쓴 뒤 이름을 바꾸는 방식으로 저장해, 쓰는 도중에 앱이 꺼져도 파일이 깨지지 않는다.
