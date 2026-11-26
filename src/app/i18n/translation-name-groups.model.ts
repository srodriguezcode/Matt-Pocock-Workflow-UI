/** The bundle's union-keyed groups: an arm the union has and a locale does not is a compile error. */

import type { ApiErrorReason, ReleaseRefusal } from '@contract/api';
import type { CostShortfall, TokenCounts } from '@contract/cost';
import type { GapProblem, GapTier, StartSkill } from '@contract/gap';
import type {
  BaseSource,
  LaunchOutcome,
  PlanRefusal,
  RollbackResult,
  StartLabel,
  StartReason,
  StepAction,
  StepFailure,
  StepKey,
  TakenReason,
} from '@contract/launch';
import type { Delivery, PeekKind, SessionNote, SessionState } from '@contract/session';
import type { ReplyHint } from '@app/panel/session/turns';
import type { NotificationReason } from '@app/session/notifications';
import type { Gate, Readiness, SystemKind, SystemState, Ticket, TicketKind } from '@contract/sky';

export type LaunchEnding = LaunchOutcome | { code: 'cut-short' };

export type StarPlace =
  | { code: 'system' }
  | { code: 'closed' }
  | { code: 'loose' }
  | { code: 'in-system'; system: string };

export type CodeWording<U extends { code: string }> = {
  [K in U['code']]: (params: Extract<U, { code: K }>) => string;
};

export type GateNames = Record<Gate, string>;

export type ReadinessNames = Record<Readiness, string>;

export type SystemStateNames = Record<SystemState, string>;

export type SystemKindNames = Record<SystemKind, string>;

export type TicketKindNames = Record<TicketKind, string>;

export type ClearLightWording = Record<
  Ticket['clearLight'],
  (blocker: string, blocked: string) => string
>;

export type GapTierNames = Record<GapTier, string>;

export type StepKeyNames = Record<StepKey, string>;

export type BaseSourceNames = Record<BaseSource, string>;

export type StartSkillNames = Record<StartSkill, string>;

export type RollbackResultNames = Record<RollbackResult, string>;

export type StartLabelWording = CodeWording<StartLabel>;

export type StartReasonWording = CodeWording<StartReason>;

export type PlanRefusalWording = CodeWording<PlanRefusal>;

export type StepActionWording = CodeWording<StepAction>;

export type TakenReasonWording = CodeWording<TakenReason>;

export type StepFailureWording = CodeWording<StepFailure>;

export type LaunchEndingWording = CodeWording<LaunchEnding>;

export type GapProblemWording = CodeWording<GapProblem>;

export type ApiErrorWording = CodeWording<ApiErrorReason>;

export type StarPlaceWording = CodeWording<StarPlace>;
export type ReleaseRefusalWording = CodeWording<ReleaseRefusal>;

export type CostShortfallWording = CodeWording<CostShortfall>;

export type TokenKindNames = Record<keyof TokenCounts, string>;

export type SessionStateNames = Record<SessionState, string>;

export type PeekKindNames = Record<PeekKind, string>;

export type DeliveryNames = Record<Delivery, string>;

export type SessionNoteWording = CodeWording<SessionNote>;

export type ReplyHintNames = Record<ReplyHint, string>;

export type NotificationReasonNames = Record<NotificationReason, string>;
