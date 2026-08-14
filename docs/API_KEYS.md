# AI API 키 발급

테가키카타는 서버가 없어서, 예문 생성·채점에 쓰는 AI를 각자 자기 API 키로 직접 호출한다(BYOK). 온보딩 화면에서 프로바이더(Gemini/Claude) 하나를 고르고 키를 붙여넣으면 된다 — Gemini든 Claude든 하나만 있으면 앱의 모든 기능을 쓸 수 있다.

## 지금은 Claude를 권장합니다

2026년 8월 기준, 신규/휴면 상태의 Gemini API 키가 계정·결제 여부와 무관하게 `403 Your project has been denied access`로 막히는 구글 쪽 알려진 이슈가 있다. 원인이 사용자 쪽 설정이 아니라 구글 프로젝트 접근 권한 쪽이라 당장 고치기 어렵다. **문제가 풀리기 전까지는 Claude 사용을 권장**하며, 온보딩 화면의 기본 선택值도 Claude로 되어 있다. Gemini가 필요하면 그대로 시도해보고, 막히면 Claude로 전환하면 된다.

## Claude API 키 발급 (권장)

1. [platform.claude.com](https://platform.claude.com) 접속 — `claude.ai`의 Pro/Max 구독과는 **별개의 계정/과금 체계**다
2. 계정이 없으면 가입, 있으면 로그인
3. 좌측 메뉴에서 **API Keys**로 이동 → **Create Key**
4. 생성된 키(`sk-ant-...`로 시작)를 복사
5. 테가키카타 온보딩 화면에서 프로바이더로 **Claude**를 선택하고 붙여넣기

무료 크레딧으로 바로 시작할 수 있다. 이후 사용량이 늘면 콘솔에서 과금 정책을 확인할 것.

## Gemini API 키 발급

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) 접속 후 구글 계정으로 로그인
2. **Create API key** → 기존 Cloud 프로젝트를 고르거나 새로 만들기
3. 생성된 키(`AIza...`로 시작)를 복사
4. 테가키카타 온보딩 화면에서 프로바이더로 **Gemini**를 선택하고 붙여넣기

`403 Your project has been denied access`가 뜨면 위에서 설명한 알려진 이슈일 가능성이 높다 — AI Studio에서 새 키를 다시 발급해보거나(최신 포맷으로 재발급되면 풀리는 경우가 있음), 안 되면 Claude로 전환할 것.

## 모델 선택 (선택 사항)

온보딩 화면의 API 키 입력 아래에 모델 선택란이 있다. 비워두면 앱이 검증해둔 기본 모델을 쓴다. 필요하면 프리셋에서 고르거나 모델 ID를 직접 입력할 수 있다:

- **Claude**: `claude-haiku-4-5-20251001`(기본, 저렴하고 빠름) / `claude-sonnet-5` / `claude-opus-5`
- **Gemini**: `gemini-3.6-flash`(기본). 다른 모델을 쓰고 싶으면 [ai.google.dev/api/models](https://ai.google.dev/api/models)에서 최신 모델명을 확인해 직접 입력할 것

예문 생성·채점처럼 가벼운 작업엔 기본 모델(Haiku/Flash급)로 충분하다. 더 정교한 채점을 원하면 상위 모델로 바꿔도 되지만, 응답 속도와 비용이 늘어난다.
