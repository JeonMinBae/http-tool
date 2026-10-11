# 스크립트

요청 전송 전(Pre-request)과 응답 수신 후(Post-response)에 JavaScript를 실행한다. Postman의 `pm` API 중 자주 쓰는 부분을 지원한다.

## 실행 순서

컬렉션, 폴더, 요청 모두 스크립트를 가질 수 있고, 바깥에서 안쪽 순으로 실행된다.

```
Pre:  컬렉션 → 바깥 폴더 → 안쪽 폴더 → 요청
(전송)
Post: 컬렉션 → 바깥 폴더 → 안쪽 폴더 → 요청
```

- 앞 단계에서 바꾼 변수와 요청 내용은 다음 단계에 그대로 이어진다.
- 한 단계에서 오류가 나면 이후 단계는 실행하지 않는다. Pre에서 오류가 나면 요청을 보내지 않는다.
- 응답이 이벤트 스트림(SSE)이면 Post 스크립트는 실행하지 않는다.

## pm API

| API | 설명 |
| --- | --- |
| `pm.variables` | 모든 스코프를 합친 조회. `set`은 지역 변수에 쓴다 |
| `pm.environment`, `pm.collectionVariables`, `pm.globals` | 스코프별 `get`, `set`, `has`, `unset`, `clear`, `replaceIn`, `toObject` |
| `pm.request` | `url`, `method`, `name`, `headers`(`get`/`add`/`upsert`/`remove`), `body`(`update`). Pre에서 바꾸면 실제 전송에 반영된다 |
| `pm.response` | `code`, `status`, `headers`, `responseTime`, `responseSize`, `text()`, `json()` (Post에서만) |
| `pm.response.to.have.status()`, `.header()`, `.jsonBody()`, `pm.response.to.be.ok` | 응답 검증 단축 표현 |
| `pm.test(name, fn)` | 테스트 등록. 결과는 응답의 Tests 탭에 표시 (`async` 함수도 가능) |
| `pm.expect` | chai `expect` |
| `pm.sendRequest(req, callback)` | 스크립트 안에서 추가 요청. Promise로도 쓸 수 있다 |
| `pm.info` | `eventName` (`prerequest`/`test`), `requestName` |
| `console.log/info/warn/error/debug` | 콘솔 패널에 출력 |
| `require("crypto-js")`, `require("lodash")`, `require("chai")` | 번들된 라이브러리. 그 밖의 모듈은 불러올 수 없다 |

`pm.sendRequest`는 전역 네트워크 설정과 쿠키 저장소를 쓰지만, 컬렉션 인증은 붙이지 않는다.

환경을 선택하지 않은 상태에서 `pm.environment.set()`을 호출하면 무시되고 콘솔에 경고가 남는다.

### 예시

```js
// Pre-request: 서명 헤더 추가
const CryptoJS = require("crypto-js");
const ts = Date.now().toString();
const sig = CryptoJS.HmacSHA256(ts, pm.environment.get("secret")).toString();
pm.request.headers.upsert({ key: "X-Signature", value: sig });

// Post-response: 토큰 저장과 검증
pm.test("200 OK", () => pm.response.to.have.status(200));
pm.environment.set("token", pm.response.json().accessToken);
```

## 샌드박스

- 스크립트마다 새 Web Worker에서 실행하고, 끝나면 Worker를 종료한다.
- Worker 자체에서 `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `indexedDB`, `caches`를 제거해 두었다. 네트워크는 `pm.sendRequest`로만 쓸 수 있다.
- 사용자 코드에서는 `self`, `globalThis`, `window`, `postMessage`, Tauri 객체 이름도 가려 두었다. 다만 이것은 이름만 가린 것이라 `Function("return this")()` 같은 우회로 Worker 전역 객체에 닿을 수 있다. 샌드박스는 실수 방지용이며, 신뢰할 수 없는 스크립트를 격리하는 보안 경계로 보지 않는다.
- 10초 안에 끝나지 않으면 강제로 중단하고 오류로 처리한다 (무한 루프 방지).

## 편집기

Scripts 탭은 Pre-request / Post-response로 나뉘며, JavaScript 문법 강조와 `pm.` 자동 완성을 지원한다. Snippets 목록에서 자주 쓰는 코드(상태 코드 검사, 변수 저장 등)를 골라 넣을 수 있다.
