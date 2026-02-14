# oh-my-claude-sub-agents (OMCSA)

당신의 커스텀 Claude Code 에이전트에 프로 수준의 오케스트레이션을 부여합니다.
명령어 한 줄로 `.claude/agents/`의 에이전트들을 협업하는 팀으로 만들어보세요.

[oh-my-claudecode](https://github.com/anthropics/claude-code)에서 영감을 받았습니다.

---

## 이 도구가 하는 일

`.claude/agents/*.md`에 커스텀 서브 에이전트를 정의해서 사용하고 계신가요? OMCSA가 다음 기능을 추가합니다:

- **오케스트레이터 프롬프트** — Claude가 자동으로 적절한 에이전트에 작업을 위임
- **병렬 실행** (Ultrawork 모드) — 여러 에이전트를 동시에 실행
- **지속 루프** (Ralph 모드) — 모든 작업이 완료될 때까지 계속 작업
- **위임 강제** — 오케스트레이터가 직접 코드를 수정하지 못하게 방지
- **모델 티어링** — 에이전트 설정에 따라 haiku/sonnet/opus 자동 라우팅

`omcsa init` 한 번이면 끝입니다.

### OMC 공존 (3-Mode 시스템)

이미 [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (OMC)를 사용 중이신가요? OMCSA가 자동으로 감지하고 Hook 충돌을 방지하는 3가지 설치 모드를 제공합니다:

| 모드 | 설명 | OMCSA Hook | OMCSA 프롬프트 |
|------|------|------------|----------------|
| `standalone` | OMCSA가 전부 처리 (기본값) | 활성 | 설치 |
| `omc-only` | OMC가 모드 처리, OMCSA는 에이전트 오케스트레이션만 | 양보 | 설치 |
| `integrated` | OMC + OMCSA 에이전트 완전 통합 | 양보 | 설치 |

---

## 요구 사항

- **Node.js** >= 18
- **Claude Code** CLI 설치 및 동작 확인
- `~/.claude/agents/` (글로벌) 또는 `.claude/agents/` (프로젝트별) 에 커스텀 에이전트 파일

---

## 설치 방법

### 방법 A: npx로 바로 실행 (설치 불필요)

```bash
cd your-project
npx oh-my-claude-sub-agents init
```

### 방법 B: 글로벌 설치

```bash
npm install -g oh-my-claude-sub-agents

# 이제 어디서든 사용 가능
omcsa init
```

### 방법 C: 소스에서 로컬 개발

```bash
git clone https://github.com/your-username/oh-my-claude-sub-agents.git
cd oh-my-claude-sub-agents
npm install
npm run build
npm link    # 'omcsa' 명령어를 글로벌로 등록
```

---

## 빠른 시작

### 1. 에이전트 파일 준비

OMCSA는 YAML frontmatter가 있는 `.md` 에이전트 파일을 사용합니다:

```
~/.claude/agents/              ← 글로벌 에이전트 (모든 프로젝트에서 사용)
  code-reviewer.md
  test-writer.md

your-project/.claude/agents/   ← 프로젝트 전용 에이전트
  backend-dev.md
  frontend-dev.md
```

에이전트 파일 형식:

```markdown
---
description: 백엔드 API 및 서버 로직 구현
model: sonnet
---

당신은 백엔드 개발자입니다. 당신의 역할은...
```

지원하는 frontmatter 필드:

| 필드 | 필수 여부 | 값 | 설명 |
|------|-----------|-----|------|
| `description` | 권장 | 문자열 | 에이전트가 하는 일 |
| `model` | 선택 | `haiku`, `sonnet`, `opus` | Task tool에서 사용할 모델 |
| `disallowedTools` | 선택 | 도구 이름들 | 이 에이전트가 사용할 수 없는 도구 |

### 2. 프로젝트에서 OMCSA 초기화

```bash
cd your-project
omcsa init
```

실행하면 다음이 자동으로 수행됩니다:
1. `~/.claude/agents/`와 `.claude/agents/`에서 모든 에이전트 파일 스캔
2. OMC (oh-my-claudecode) 설치 여부 감지
3. 오케스트레이터 프롬프트를 생성하여 `.claude/CLAUDE.md`에 추가
4. 스마트 Hook 스크립트를 `.claude/hooks/`에 설치
5. `.claude/settings.json`에 Hook 등록
6. 설치 모드를 `.omcsa/mode.json`에 저장

OMC가 감지되면 `--mode integrated` 사용을 안내합니다.

### 3. Claude Code 사용

```bash
claude
```

이제 Claude가 자동으로 에이전트들에게 작업을 위임합니다.

---

## 사용 모드

### 일반 모드

평소처럼 Claude Code를 사용하면 됩니다. 오케스트레이터 프롬프트가 Claude에게 적절한 에이전트로 위임하도록 안내합니다.

```
> 사용자 인증 API를 구현해줘

# Claude가 backend-dev 에이전트에 자동 위임
```

### Ultrawork 모드 (병렬 실행)

프롬프트 앞에 `ultrawork:` 또는 `ulw:`를 붙이면 에이전트들이 병렬로 실행됩니다.

```
> ultrawork: 로그인 페이지 프론트엔드와 인증 API 백엔드를 구현해줘

# Claude가 frontend-dev와 backend-dev를 동시에 실행
```

### Ralph 모드 (지속 루프)

`ralph:`를 붙이면 모든 작업이 완료될 때까지 Claude가 계속 작업합니다.

```
> ralph: 결제 플로우 전체를 구현하고 테스트와 코드 리뷰까지 완료해줘

# Claude가 모든 태스크가 검증을 통과할 때까지 반복
```

### 활성 모드 취소

```bash
# CLI에서
omcsa cancel

# 또는 Claude Code 프롬프트에서
> cancelomcsa
```

---

## CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `omcsa init` | 초기 설정: 에이전트 스캔, 프롬프트 생성, Hook 설치 |
| `omcsa init --config` | 초기 설정 + `omcsa.config.json` 설정 파일 생성 |
| `omcsa init --mode <mode>` | 모드 지정 초기화: `standalone`, `omc-only`, `integrated` |
| `omcsa switch <mode>` | 런타임 모드 전환 (재설치 불필요) |
| `omcsa status` | 현재 설정 상태, OMC 감지 결과, 설치 모드 확인 |
| `omcsa refresh` | 에이전트 재스캔 및 오케스트레이터 프롬프트 재생성 |
| `omcsa apply` | `omcsa.config.json` 수정 후 재적용 |
| `omcsa cancel` | 활성 지속 모드(ralph/ultrawork) 취소 |
| `omcsa omc disable` | OMC 플러그인 전역 비활성화 (`~/.claude/settings.json`에서 제거) |
| `omcsa omc enable` | OMC 플러그인 재활성화 (백업에서 복원) |
| `omcsa uninstall` | 프로젝트에서 OMCSA 구성 요소 전체 제거 |

---

## 설정 (선택)

세밀한 제어가 필요하면 설정 파일을 생성하세요:

```bash
omcsa init --config
```

`.claude/omcsa.config.json`이 생성됩니다:

```json
{
  "agents": {
    "backend-dev": { "tier": "MEDIUM", "category": "implementation" },
    "code-reviewer": { "tier": "HIGH", "category": "review" },
    "test-writer": { "tier": "LOW", "category": "testing" }
  },
  "features": {
    "ultrawork": true,
    "ralph": true,
    "delegationEnforcement": "warn",
    "modelTiering": true
  },
  "keywords": {
    "ultrawork": ["ultrawork", "ulw"],
    "ralph": ["ralph", "must complete", "until done"],
    "cancel": ["cancelomcsa", "stopomcsa"]
  },
  "persistence": {
    "maxIterations": 10,
    "stateDir": ".omcsa/state"
  }
}
```

수정 후 `omcsa apply`를 실행하면 반영됩니다.

### 위임 강제 수준

| 수준 | 동작 |
|------|------|
| `off` | 제한 없음 |
| `warn` (기본값) | 오케스트레이터가 소스 파일을 직접 수정하려 하면 경고 |
| `strict` | 소스 파일 직접 수정을 차단하고 위임을 강제 |

---

## 에이전트 워크플로우 정의

OMCSA는 `.claude/CLAUDE.md`에 정의한 워크플로우를 자동으로 따릅니다.

오케스트레이터 프롬프트에 **Workflow & Convention Integration** 섹션이 포함되어 있어, CLAUDE.md에 작성된 모든 규칙, 워크플로우, 컨벤션을 Claude가 준수합니다.

### 예시

`.claude/CLAUDE.md`에 워크플로우를 작성하세요 (OMCSA 섹션 위 또는 아래):

```markdown
## 팀 워크플로우

- `backend-dev` 작업 완료 후 `code-reviewer`에게 리뷰 요청
- `code-reviewer` 피드백이 있으면 `backend-dev`에게 수정 위임
- 모든 구현 에이전트 완료 후 `test-writer` 실행
- 완료 시 `docs/completed/`에 요약 문서 생성
```

OMCSA의 오케스트레이터가 이 규칙을 자동으로 따릅니다. 추가 설정 불필요.

### 동작 원리

1. Claude Code가 `.claude/CLAUDE.md` 전체를 시스템 프롬프트에 로드
2. 워크플로우 규칙이 OMCSA 섹션과 함께 오케스트레이터에게 표시됨
3. OMCSA 프롬프트가 Claude에게 명시: "이 문서의 모든 워크플로우 규칙을 따르세요"
4. 에이전트 체이닝은 오케스트레이터 레벨에서 처리 (서브 에이전트는 다른 에이전트 호출 불가)

---

## OMC 공존

[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (OMC)가 글로벌 플러그인으로 설치되어 있으면, OMCSA가 자동 감지하여 Hook 충돌을 방지합니다.

### 문제

OMC와 OMCSA는 동일한 이벤트(UserPromptSubmit, Stop, PreToolUse)에 Hook을 등록합니다. 공존 모드 없이는:
- 키워드 이중 감지 (ultrawork/ralph가 두 번 트리거)
- Stop Hook 이중 실행
- 위임 강제 이중 적용

### 해결: 스마트 Hook

OMCSA Hook은 "스마트"합니다 — 런타임에 `.omcsa/mode.json`을 읽고 실행 여부를 결정합니다:

```
standalone 모드  → OMCSA Hook 정상 실행
omc-only 모드    → OMCSA Hook 양보 ({ continue: true })
integrated 모드  → OMCSA Hook 양보 ({ continue: true })
```

Hook은 모드와 무관하게 항상 설치됩니다. 모드 전환 시 `mode.json`만 업데이트하면 됩니다.

### 에이전트 배타성 (Standalone 모드)

Standalone 모드에서 OMC가 감지되면, 오케스트레이터 프롬프트에 **에이전트 배타성** 지시가 포함되어
Claude가 OMCSA가 관리하는 에이전트만 사용하고 OMC 내장 에이전트(예: `oh-my-claudecode:architect`)를 무시하도록 합니다.

이는 프롬프트 수준의 강제입니다. 더 강한 격리가 필요하면 `omcsa omc disable`로 OMC를 완전히 제거하세요.

### OMC 플러그인 비활성화

OMC 에이전트로부터 완전한 격리가 필요하면, OMC 플러그인을 일시적으로 비활성화할 수 있습니다:

```bash
# OMC 비활성화 (~/.claude/settings.json에서 제거)
omcsa omc disable

# OMC 재활성화 (백업에서 복원)
omcsa omc enable
```

> **주의**
>
> `omcsa omc disable`은 **전역** `~/.claude/settings.json` 파일을 수정합니다.
> 현재 프로젝트뿐 아니라 모든 프로젝트와 Claude Code 세션에 영향을 미칩니다.
>
> - 비활성화된 OMC 플러그인 항목은 `.omcsa/omc-backup.json`에 백업됩니다
> - `omcsa omc enable`으로 원래 설정을 복원할 수 있습니다
> - 백업 파일이 유실되면 수동으로 OMC 플러그인을 다시 추가해야 합니다
> - OMCSA를 제거하기 전에 반드시 `omcsa omc enable`을 실행하여 OMC를 복원하세요

### 사용법

```bash
# 기본: standalone (OMCSA가 전부 처리)
omcsa init

# OMC와 함께: OMC가 모드 처리, OMCSA는 오케스트레이션 추가
omcsa init --mode integrated

# 런타임 모드 전환 (즉시, 재설치 불필요)
omcsa switch integrated
omcsa switch standalone

# 현재 모드 확인
omcsa status
```

### 모드 상세

| | standalone | omc-only | integrated |
|---|---|---|---|
| CLAUDE.md 오케스트레이터 | 전체 | 프롬프트만 | 프롬프트만 |
| Hook 설치 | 예 | 예 (양보) | 예 (양보) |
| settings.json | 예 | 예 | 예 |
| ultrawork/ralph | OMCSA | OMC | OMC |
| 에이전트 위임 | OMCSA 전용 (배타적) | OMC 28개 + 커스텀 목록 | OMC + 커스텀 |

---

## 생성되는 파일 구조

`omcsa init` 실행 후 프로젝트에 추가되는 내용:

```
your-project/
├── .claude/
│   ├── CLAUDE.md              ← 오케스트레이터 프롬프트가 추가됨
│   ├── settings.json          ← Hook 등록이 추가됨
│   ├── hooks/
│   │   ├── omcsa-keyword-detector.mjs    ← ultrawork/ralph 키워드 감지
│   │   ├── omcsa-persistent-mode.mjs     ← ralph 모드 지속 실행
│   │   └── omcsa-pre-tool-use.mjs        ← 위임 강제
│   └── agents/                ← 기존 에이전트 파일 (변경 없음)
│       ├── backend-dev.md
│       └── ...
└── .omcsa/
    ├── mode.json              ← 현재 설치 모드 (standalone/omc-only/integrated)
    ├── omc-backup.json        ← OMC 플러그인 백업 (`omc disable` 시 생성)
    └── state/                 ← 지속 모드 런타임 상태
```

### CLAUDE.md 마커

OMCSA는 마커 사이의 내용만 수정합니다:

```markdown
# 기존 CLAUDE.md 내용 (보존됨)

<!-- [OMCSA:START] - Auto-generated by oh-my-claude-sub-agents. Do not edit manually. -->
## Agent Orchestration
...
<!-- [OMCSA:END] -->

# 기존 CLAUDE.md 내용 (보존됨)
```

`omcsa refresh`나 `omcsa uninstall` 실행 시 마커 사이의 내용만 변경/제거됩니다.

---

## 에이전트 파일 예시

### 구현 에이전트

```markdown
---
description: React/Next.js 프론트엔드 기능 구현
model: sonnet
---

당신은 React와 Next.js를 전문으로 하는 프론트엔드 개발자입니다.

## 역할
- UI 컴포넌트와 페이지 구현
- 프로젝트의 컴포넌트 패턴을 따름
- 깔끔하고 접근성 높은 JSX/TSX 작성

## 제약사항
- 혼자 작업합니다. 다른 에이전트를 호출하지 마세요.
- 기존 코드 컨벤션을 따르세요.
```

### 리뷰 에이전트 (읽기 전용)

```markdown
---
description: 코드 리뷰 및 품질 검증
model: opus
disallowedTools: Write, Edit, MultiEdit
---

당신은 시니어 코드 리뷰어입니다.

## 역할
- 정확성, 보안, 유지보수성 관점에서 코드 리뷰
- file:line 형식으로 구체적인 피드백 제공
- 읽기 전용입니다. 파일을 수정할 수 없습니다.
```

### 경량 에이전트

```markdown
---
description: 유닛 테스트 및 통합 테스트 작성
model: haiku
---

당신은 테스트 작성자입니다. 주어진 코드에 대한 포괄적인 테스트를 작성하세요.
```

---

## Subscription 사용자와 API 사용자

OMCSA는 Claude Code 구독 플랜과 API 키 모두 지원합니다.

- **모델 티어링**: 에이전트가 `model: opus`를 지정했지만 플랜이 지원하지 않으면 Claude가 자동으로 사용 가능한 모델로 대체
- **API 키 불필요**: 모든 기능이 CLAUDE.md 프롬프트와 Hook으로 동작
- **속도 제한**: 구독 사용자는 대량 병렬 실행 시 속도 제한에 걸릴 수 있음. 필요시 동시 실행 수를 줄이세요

---

## 제거

```bash
omcsa uninstall
```

제거 대상:
- `.claude/hooks/`의 Hook 스크립트
- `.claude/CLAUDE.md`의 OMCSA 섹션
- `.claude/settings.json`의 Hook 등록
- `.omcsa/` 상태 디렉토리

`.claude/agents/`의 에이전트 파일은 절대 건드리지 않습니다.

---

## 라이선스

MIT

[oh-my-claudecode](https://github.com/anthropics/claude-code) (MIT 라이선스)에서 영감을 받았습니다.
