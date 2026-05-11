# 🛡️ DEVELOPMENT GUIDELINES & PROJECT RULES

**⚠️ CRITICAL: This file contains the 13 immutable project rules that MUST be followed by ALL AI agents and developers working on this codebase. These rules supersede any other documentation or preferences. Commit to long-term memory!**

---

## 📋 THE 13 IMMUTABLE PROJECT RULES

### 🔴 RULE 1: FOUNDATION FEATURES
**NEVER change any foundational features or functions without explicit user acknowledgement. This includes core chat functionality, file processing, plugin systems, or any existing user workflows.**

### 🔴 RULE 2: PRODUCTION QUALITY
**Remember, there can ALWAYS be a better way to do something. NEVER skip, shortcut, or "dumb down" tasks for ease. No exceptions for complexity or difficulty.Always use the most current/latest libraries/components whenever possible, unless it sacrifies stability or security**

### 🔴 RULE 3: COMPLETE REFACTORING
**Identify and refactor ALL incomplete code/modules/mocks for production readiness. This includes removing ALL simulated logic, mock data, and placeholder implementations.**

### 🔴 RULE 4: CODEBASE STREAMLINING
**Minimize codebase sprawl by continuously removing unnecessary files, duplicates, and backups as you work. Maintain a lean, efficient codebase. Keep organized such as using /docs, /backups, /images, etc. in the root. Already existing, make sure ALL links to the organization changes is changed anywhere/everywhere they exist**

### 🔴 RULE 5: TOKEN LIMIT STRATEGY
**Use efficient strategies to overcome token/context limits (chunking/merging files), but ensure a streamlined final codebase. Never leave fragmented code.**

### 🔴 RULE 6: CLARIFICATION OVER ASSUMPTION
**Always clarify uncertainties with the user rather than making assumptions. When in doubt, ask for explicit confirmation.**

### 🔴 RULE 7: EFFICIENT WORKFLOW
**Work tasks in the most efficient order for project and workflow efficiency. Do not ask what to work on next - prioritize based on project needs and the most efficient order for your agentic workflow processes. Be smart/innovative and always use every tool/option at your disposal to be as efficient as possible - parallelism, spinning up your own temporary AI Agents (or permanent!), etc. are examples of efficiency and innovation expected**

### 🔴 RULE 8: VISUAL TASK TRACKING
**Maintain a visually stunning, graphical task list file for live IDE updates. This dashboard must remain current and visually appealing and updated as progress is made within a CURRENT_TASKS.md file in the root.**

### 🔴 RULE 9: DOCUMENTATION CONSISTENCY
**Consistently update documentation for seamless agent transitions. Every change must be documented for the next developer.**

### 🔴 RULE 10: RULE EVOLUTION
**Add any new rules/requirements to this list as they arise. This document must evolve with the project.**

### 🔴 RULE 11: 100% GOAL COMPLETION
**Ensure 100% goal completion. No returning to address troublesome tasks/issues/fixes unless explicitly advised. Complete everything the first time and always be in the mindset to develop for production (no mock, unfinished components, etc. unless explicitly tasked to do so. Full production-ready code is required at all times. Do NOT state the project is 100%, production ready, etc. unless you are told it is. There should be NO false claims of completion, 100%, or otherwise unless it absolutely 100% is - which you will be told when this is. No "blowing smoke", keep 100% honest at all times.**

### 🔴 RULE 12: NEXT-GEN INNOVATION
**Target next-gen/futuristic GUI with bleeding-edge components and innovative workflow design, while maintaining production stability.**

### 🔴 RULE 13: QUALITY-FIRST PRINCIPALS
**See Quality-First Development Principals principals/philosophy below for comprehensive quality standards. EVERY feature must meet the "TRULY DONE" checklist before being considered complete. No shortcuts. No "good enough for now." No rushing to deployment. Quality over speed, ALWAYS. Zero TypeScript errors, zero ESLint errors, 99.9%+ test coverage, comprehensive E2E testing, and full visual/accessibility verification are MANDATORY before any production claims. This supersedes all quick-win strategies.**

---

## Quality-First Development Principals

**Project:** This Project 
**Established:** January 2025  
**Status:** 🔴 **IMMUTABLE PRINCIPLE** - This document supersedes quick wins  
**Priority:** Quality > Speed, Always - we are not "token counting" or worried about time/costs, etc. - our goal is PERFECTION always.

## VMware → Morpheus Migration Automation Program

To meet the enterprise migration mandate, all contributors must adhere to the following guardrails:

1. **Documentation Sources (Immutable):**
   - `CURRENT_TASKS.md` – live dashboard reflecting current priorities and progress. Update it whenever tasks shift.
   - `docs/ARCHITECTURE.md` – canonical design record. Keep integrations, security constraints, and roadmap sequencing current.
   - `docs/WORKFLOW_SCHEMA.md` – defines allowable playbook schema, action modules, and validation rules. Extend this before adding new actions.
   - `workflow_engine.py` – source of truth for schema parsing, validation, and execution orchestration.

2. **Change Management:**
   - No VM-prep automation change is complete until documentation + dashboard updates land in the same PR.
   - Every new workflow must include validation gates (pre-flight, mid-run, post-run) and emit structured telemetry per schema.

3. **Integration Awareness:**
   - Coordinate with Morpheus, vCenter, Technitium, and Juniper teams before enabling new connectors.
   - Feature-flag beta integrations; default to safe/off until validated in staging.

4. **Auditability:**
   - Persist per-step results, approvals, and artifacts to the database for replay.
   - Ensure rollback procedures are encoded as first-class workflows, not tribal knowledge.

---

## 🎯 Core Principle

> **"Build it right, not fast. No shortcuts. No compromises. Every single feature production-worthy - no exceptions."**

This project follows an uncompromising quality-first development philosophy. This document establishes the standards and expectations that must be met before any code is considered "complete" or "production-ready."

---

## 📜 The Quality Manifesto

### 1. No Shortcuts, Ever

- ❌ **NEVER** implement quick wins for the sake of showing progress
- ❌ **NEVER** use mock data in production code paths
- ❌ **NEVER** add TODO comments without completing the work
- ❌ **NEVER** skip testing "to save time"
- ❌ **NEVER** rush to deployment before comprehensive validation

### 2. Everything Must Be Real

- ✅ All components must be fully functional, not placeholders
- ✅ All data flows must be complete, not mocked
- ✅ All error handling must be comprehensive, not basic
- ✅ All features must work end-to-end, not partially
- ✅ All integrations must be tested, not assumed

### 3. Comprehensive Testing is Mandatory

- ✅ **Unit Tests:** Every service, utility, and helper function
- ✅ **Component Tests:** Every React component in isolation
- ✅ **Integration Tests:** Every data flow and service interaction
- ✅ **E2E Tests:** Every user workflow from start to finish
- ✅ **Visual Tests:** Every UI element and layout variation
- ✅ **Accessibility Tests:** Every interactive element
- ✅ **Performance Tests:** Every critical path operation

### 4. Production-Worthy Means Production-Worthy

Before declaring anything "production-ready," it must:
- ✅ Have zero TypeScript errors
- ✅ Have zero ESLint errors (not just warnings)
- ✅ Have 90%+ test coverage
- ✅ Pass all E2E tests
- ✅ Be accessible (WCAG 2.1 AA minimum)
- ✅ Perform well (Lighthouse score 90+)
- ✅ Be documented comprehensively
- ✅ Handle all edge cases
- ✅ Have proper error boundaries
- ✅ Be secure by design

---

## 🔍 Verification Standards

### Code Quality Standards

IF JavaScript based:
#### TypeScript (Zero Tolerance)
```bash
npm run typecheck
# Expected: 0 errors, 0 warnings
# Anything else: NOT ACCEPTABLE
```

#### ESLint (Zero Tolerance)
```bash
npm run lint
# Expected: 0 errors, 0 warnings
# "Most errors are low priority": NOT AN EXCUSE
```

#### Build (Must Succeed)
```bash
npm run build
# Expected: Clean build, no warnings, optimized bundle
# Any warnings or errors: FIX IMMEDIATELY
```

---

### Testing Standards

#### Unit Test Coverage
```bash
npm run test:coverage
# Expected: 90%+ coverage across all metrics
# Statements: 90%+
# Branches: 90%+
# Functions: 90%+
# Lines: 90%+
```

#### Component Test Requirements
Every component MUST have tests for:
- ✅ Initial render
- ✅ User interactions (click, type, drag, etc.)
- ✅ State changes
- ✅ Props variations
- ✅ Error states
- ✅ Loading states
- ✅ Edge cases
- ✅ Accessibility

#### E2E Test Requirements
Every user workflow MUST have E2E tests:
- ✅ Configuration upload workflow
- ✅ Device creation and editing
- ✅ Connection creation
- ✅ Topology visualization
- ✅ AI analysis trigger and results
- ✅ Export functionality
- ✅ Settings management
- ✅ Error handling and recovery

---

### Visual & UX Standards

#### Browser Compatibility (Must Test)
- ✅ Chrome (latest, latest-1)
- ✅ Firefox (latest, latest-1)
- ✅ Safari (latest, latest-1)
- ✅ Edge (latest)
- ✅ Mobile Safari (iOS 14+)
- ✅ Chrome Mobile (Android 10+)

#### Visual Regression Testing
- ✅ Screenshot tests for all major views
- ✅ Comparison against baseline
- ✅ No unintended visual changes
- ✅ Responsive design verification

#### Accessibility Requirements (WCAG 2.1 AA)
- ✅ Keyboard navigation works everywhere
- ✅ Screen reader compatibility verified
- ✅ Color contrast ratios meet standards
- ✅ Focus indicators visible
- ✅ ARIA labels present and correct
- ✅ Form labels associated properly
- ✅ Error messages announced

#### Performance Requirements (Lighthouse)
- ✅ Performance: 90+
- ✅ Accessibility: 90+
- ✅ Best Practices: 90+
- ✅ SEO: 80+

---

## 🚫 The "NOT DONE" Checklist

A feature/component/service is **NOT DONE** if:

- [ ] TypeScript shows ANY errors
- [ ] ESLint shows ANY errors (yes, even `no-explicit-any`)
- [ ] Tests don't exist or are incomplete
- [ ] Test coverage is below 90%
- [ ] E2E tests don't exist
- [ ] Documentation is missing or incomplete
- [ ] Error handling is missing or basic
- [ ] Edge cases aren't handled
- [ ] Loading states aren't implemented
- [ ] Error states aren't implemented
- [ ] Accessibility hasn't been tested
- [ ] Performance hasn't been measured
- [ ] Browser compatibility hasn't been verified
- [ ] Mock data exists in production code
- [ ] TODO comments exist
- [ ] Console.log statements exist (except logger.service)
- [ ] Hard-coded values should be configurable
- [ ] Code isn't reviewed
- [ ] Documentation isn't reviewed

---

## ✅ The "TRULY DONE" Checklist

A feature/component/service is **TRULY DONE** when:

### Code Quality ✅
- [x] Zero TypeScript errors (`npm run typecheck`)
- [x] Zero ESLint errors (`npm run lint`)
- [x] Zero console.log statements (except logger.service)
- [x] No TODO comments
- [x] No mock data in production paths
- [x] No hard-coded values that should be configurable
- [x] All functions have proper return types
- [x] All variables have proper types (no `any`)
- [x] Code follows project patterns
- [x] Code is DRY (Don't Repeat Yourself)

### Testing ✅
- [x] Unit tests written and passing
- [x] Component tests written and passing
- [x] Integration tests written and passing
- [x] E2E tests written and passing
- [x] Test coverage > 90%
- [x] All edge cases tested
- [x] Error scenarios tested
- [x] Loading states tested
- [x] Accessibility tested

### Functionality ✅
- [x] Feature works end-to-end
- [x] All user interactions work
- [x] Error handling is comprehensive
- [x] Loading states implemented
- [x] Error states implemented
- [x] Success feedback implemented
- [x] Edge cases handled
- [x] Performance is acceptable
- [x] Works in all supported browsers

### Documentation ✅
- [x] Code is commented (complex logic)
- [x] JSDoc comments for public APIs
- [x] README updated (if needed)
- [x] ARCHITECTURE.md updated (if needed)
- [x] User documentation written
- [x] Examples provided

### Review ✅
- [x] Code self-reviewed
- [x] Tested in development
- [x] Tested in production-like environment
- [x] Verified against requirements
- [x] No regressions introduced

---

## 🎯 Practical Implementation

### Before Starting ANY Work

1. **Understand the requirement fully**
   - What problem does this solve?
   - What are the edge cases?
   - What can go wrong?
   - How will users interact with this?

2. **Plan the implementation**
   - What components are needed?
   - What services are needed?
   - What types are needed?
   - What tests are needed?

3. **Consider the implications**
   - Performance impact?
   - Bundle size impact?
   - Accessibility implications?
   - Security considerations?

### During Development

1. **Write tests FIRST** (TDD approach)
   - Write failing test
   - Implement feature
   - Make test pass
   - Refactor
   - Repeat

2. **Check quality continuously**
   ```bash
   # Run after every meaningful change
   npm run typecheck
   npm run lint
   npm run test
   ```

3. **Handle ALL scenarios**
   - Success path
   - Error path
   - Loading state
   - Empty state
   - Edge cases

### After Implementation

1. **Comprehensive Testing**
   ```bash
   npm run test:coverage      # Unit & Component tests
   npm run test:e2e          # E2E tests
   npm run test:visual       # Visual regression
   npm run test:a11y         # Accessibility
   ```

2. **Performance Verification**
   ```bash
   npm run build             # Check bundle size
   npm run analyze           # Analyze bundle composition
   # Run Lighthouse audit
   ```

3. **Manual Verification**
   - Test in all supported browsers
   - Test keyboard navigation
   - Test with screen reader
   - Test on mobile devices
   - Test with slow network
   - Test with disabled JavaScript (graceful degradation)

---

## 📏 Quality Gates

### Gate 1: Code Merge (Pull Request)
**Automated Checks:**
- ✅ TypeScript compilation succeeds
- ✅ ESLint passes with zero errors
- ✅ All tests pass
- ✅ Test coverage meets threshold (90%+)
- ✅ Build succeeds
- ✅ Bundle size within limits

**Manual Checks:**
- ✅ Code review completed
- ✅ Documentation reviewed
- ✅ Tests reviewed for completeness

**BLOCKING:** If ANY check fails, PR is REJECTED

### Gate 2: Deployment to Staging
**All Gate 1 checks PLUS:**
- ✅ E2E tests pass in staging environment
- ✅ Visual regression tests pass
- ✅ Performance tests pass (Lighthouse 90+)
- ✅ Accessibility tests pass (axe-core)
- ✅ Security scan passes (npm audit)
- ✅ Manual smoke testing completed

**BLOCKING:** If ANY check fails, deployment STOPS

### Gate 3: Deployment to Production
**All Gate 1 & 2 checks PLUS:**
- ✅ Staging soak test completed (24+ hours)
- ✅ No critical/high bugs in staging
- ✅ User acceptance testing completed
- ✅ Documentation finalized
- ✅ Rollback plan documented
- ✅ Monitoring configured
- ✅ Alerts configured

**BLOCKING:** If ANY check fails, production deployment STOPS

---

## 🛑 Common Anti-Patterns to AVOID

### ❌ "Good Enough for Now"
```typescript
// ❌ WRONG - Placeholder implementation
function parseConfig(data: any) {
  // TODO: Implement proper parsing
  return data;
}
```

```typescript
// ✅ RIGHT - Complete implementation
function parseConfig(data: unknown): ParsedConfig {
  if (!isValidConfigData(data)) {
    throw new ConfigParseError('Invalid configuration data');
  }
  return {
    hostname: extractHostname(data),
    interfaces: extractInterfaces(data),
    // ... complete extraction
  };
}
```

### ❌ "We'll Test It Later"
```typescript
// ❌ WRONG - No tests
export function calculateMetrics(devices: Device[]): Metrics {
  // Complex calculation logic
}
```

```typescript
// ✅ RIGHT - Tests written first
describe('calculateMetrics', () => {
  it('should handle empty array', () => {
    expect(calculateMetrics([])).toEqual(defaultMetrics);
  });
  
  it('should calculate correct totals', () => {
    const devices = [mockDevice1, mockDevice2];
    expect(calculateMetrics(devices)).toEqual(expectedMetrics);
  });
  
  it('should handle null values gracefully', () => {
    const devices = [deviceWithNulls];
    expect(calculateMetrics(devices)).toEqual(safeMetrics);
  });
});

export function calculateMetrics(devices: Device[]): Metrics {
  // Implementation
}
```

### ❌ "It Works on My Machine"
```typescript
// ❌ WRONG - No error handling
async function loadData() {
  const response = await fetch('/api/data');
  return response.json();
}
```

```typescript
// ✅ RIGHT - Comprehensive error handling
async function loadData(): Promise<Data> {
  try {
    const response = await fetch('/api/data', {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!isValidData(data)) {
      throw new ValidationError('Invalid data format received');
    }
    
    return data;
  } catch (error) {
    if (error instanceof NetworkError) {
      logger.error('Network request failed', error, { endpoint: '/api/data' });
      throw error;
    }
    
    logger.error('Unexpected error loading data', error);
    throw new DataLoadError('Failed to load data', { cause: error });
  }
}
```

---

## 📊 Metrics & Monitoring

### Development Metrics
Track and maintain:
- **TypeScript Errors:** Must be 0
- **ESLint Errors:** Must be 0
- **Test Coverage:** Must be > 99.9%
- **Build Time:** Should be < 30 seconds
- **Bundle Size:** Should be < 500KB (gzipped)

### Production Metrics
Monitor continuously:
- **Error Rate:** Should be < 0.1%
- **Load Time:** Should be < 3 seconds
- **Lighthouse Score:** Should be > 90
- **User Satisfaction:** Should be > 4.5/5
- **Uptime:** Should be > 99.9%

---

## 🎓 The Quality-First Mindset

### Questions to Ask Yourself

Before committing code:
- Would I be comfortable if this broke in production?
- Have I tested ALL the ways this could fail?
- Would another developer understand this code?
- Is this the best solution, not just the fastest?
- Am I proud of this code?

### The Quality Pledge

> **"I will not ship code I'm not proud of."**
> 
> **"I will test thoroughly, not superficially."**
> 
> **"I will document completely, not minimally."**
> 
> **"I will handle errors gracefully, not optimistically."**
> 
> **"I will build for production, not just for demo."**

---

## 🚀 The Path to True Production-Worthiness

### Phase 1: Foundation (Current)
- ✅ Zero TypeScript errors
- ✅ Clean architecture
- ✅ Production-grade logging
- ✅ Comprehensive documentation

### Phase 2: Quality (In Progress)
- [ ] Zero ESLint errors
- [ ] 90%+ test coverage
- [ ] All E2E tests passing
- [ ] Visual regression tests
- [ ] Accessibility compliance
- [ ] Performance optimization

### Phase 3: Excellence (Next)
- [ ] Advanced features fully tested
- [ ] Multi-browser verification
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] User feedback incorporated

### Phase 4: Mastery (Future)
- [ ] Continuous improvement
- [ ] Advanced monitoring
- [ ] Proactive optimization
- [ ] Community contributions
- [ ] Industry recognition

---

## 📚 Required Reading

Every team member must understand:
1. **DEVELOPMENT.md** - The 13 Immutable Rules
2. **QUALITY_FIRST.md** - This document
3. **ARCHITECTURE.md** - System architecture
4. **Testing Best Practices** - Testing pyramid, patterns

---

## 🔄 Continuous Improvement

This document is LIVING and should evolve:
- Review quarterly
- Update based on learnings
- Add new standards as needed
- Remove outdated practices
- Share with team regularly

---

## 🎯 Success Criteria

This project will be **TRULY PRODUCTION-WORTHY** when and ONLY when:

1. ✅ **Zero Technical Debt**
   - No TypeScript errors
   - No ESLint errors
   - No TODO comments
   - No mock data in production

2. ✅ **Comprehensive Testing**
   - 99.9%+ test coverage
   - All E2E tests passing
   - Visual regression tests passing
   - Accessibility tests passing

3. ✅ **Excellent Performance**
   - Lighthouse score > 90
   - Load time < 3 seconds
   - Smooth 60fps interactions
   - Bundle size optimized

4. ✅ **Rock-Solid Reliability**
   - Error rate < 0.1%
   - Graceful error handling everywhere
   - Comprehensive error boundaries
   - Proper fallbacks

5. ✅ **Outstanding UX**
   - Intuitive workflows
   - Clear feedback
   - Accessible to all users
   - Works in all supported browsers

6. ✅ **Production-Grade Code**
   - Clean, maintainable
   - Well-documented
   - Following best practices
   - Reviewed and approved

---

## 🙏 Final Words

> **"Quality is not an act, it is a habit."** - Aristotle

We don't build fast and fix later. We build right the first time.

We don't ship and hope. We test and verify.

We don't accept "good enough." We demand excellence.

This is the way. This is the quality-first way.

---

**Document Status:** 🔴 **IMMUTABLE PRINCIPLE**  
**Established:** January 2025  
**Review Schedule:** Quarterly  
**Compliance:** Mandatory for ALL code

**Remember:** Quality over speed, always. No shortcuts, ever. 🎯


## 📊 Current Development Focus:




### ✅ ACTIVE PRIORITIES HERE:




### ❌ DEFERRED FEATURES (Back-Burner)


## 📋 Agent Transition Checklist

When transitioning between AI agents, ensure:

- [ ] All 13 rules have been reviewed and understood
- [ ] Current task progress is documented in ROADMAP.md
- [ ] CURRENT_TASKS.md is updated with latest progress close to realtime
- [ ] Any new rules/requirements are added to this file
- [ ] Back-burner features remain deferred
- [ ] Production readiness is maintained

---

## 🔗 Quick Reference Links

- **HANDOFF.md**: Agent-to-agent handoff context (read first when picking up)
- **REVIEW.md**: Canonical 70-finding code-level audit (severity-tagged, file:line citations)
- **CURRENT_TASKS.md**: Live progress board (phase-by-phase)
- **COMPLETION_REPORT.md**: Honest narrative of what is actually shipped
- **CLAUDE.md**: Quick-start context loaded by Claude Code on every invocation
- **DEVELOPMENT.md**: This rule document (current file)
- **vizcloud-backlog.html** (Cowork artifact): Interactive backlog explorer

### Agent transition trail (most recent first)

| Date       | From → To                            | Notes |
|------------|--------------------------------------|-------|
| 2026-05-09 | Cowork-mode → Claude Code CLI        | 7-bundle remediation pass complete (Phase 0–4 except signing creds + OTel SDK). 978-entry `package-lock.json` committed; install/typecheck/test verification deferred to next agent due to sandbox 45s-per-command hard limit. See `HANDOFF.md`. |

---

**⚠️ WARNING**: Any deviation from these 13 rules & associated principals requires explicit user approval and documentation in this file.

**📅 Last Updated**: September 29, 2025 at 11:10 AM CST
**📞 Questions**: Always clarify before proceeding with any uncertain implementation
