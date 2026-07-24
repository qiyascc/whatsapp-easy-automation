import { EventTriggerNode, ManualTriggerNode, ScheduleTriggerNode } from './definitions/triggerNodes.js';
import {
  SendTextNode,
  SendLinkNode,
  SendImageNode,
  SendVideoNode,
  SendDocumentNode,
  SendAudioNode,
  SendLocationNode,
  SendContactCardNode,
  TypingNode,
  SendButtonsNode,
  ReactLastMessageNode,
  DeleteLastMessageNode
} from './definitions/messagingNodes.js';
import {
  GroupInviteNode,
  GroupAddNode,
  GroupRemoveNode,
  GroupRoleNode,
  JoinGroupNode,
  LeaveGroupNode,
  GroupSendTextNode,
  GroupSendImageNode
} from './definitions/groupNodes.js';
import {
  GroupSubjectNode,
  GroupDescriptionNode,
  GroupSettingNode,
  GroupRevokeInviteNode,
  ProfileNameNode,
  ProfileStatusNode,
  ProfilePictureNode
} from './definitions/adminNodes.js';
import { ExtractNumbersNode, SaveContactNode, SetContactStatusNode, ScrapeGroupNode, LogNode } from './definitions/dataNodes.js';
import {
  VerifyInGroupNode,
  VerifyLeftGroupNode,
  VerifyNumberExistsNode,
  ConditionNode,
  CheckJoinedNode
} from './definitions/verifyNodes.js';
import { WaitNode, StopNode, HttpRequestNode } from './definitions/flowNodes.js';

const CATEGORIES = Object.freeze([
  { id: 'trigger', label: 'Triggers' },
  { id: 'data', label: 'Data' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'group', label: 'Groups' },
  { id: 'admin', label: 'Group admin' },
  { id: 'profile', label: 'Profile' },
  { id: 'verify', label: 'Checks' },
  { id: 'flow', label: 'Flow' },
  { id: 'integration', label: 'Integrations' }
]);

const NODE_CLASSES = Object.freeze([
  EventTriggerNode,
  ManualTriggerNode,
  ScheduleTriggerNode,
  ExtractNumbersNode,
  SaveContactNode,
  SetContactStatusNode,
  ScrapeGroupNode,
  LogNode,
  SendTextNode,
  SendLinkNode,
  SendImageNode,
  SendVideoNode,
  SendDocumentNode,
  SendAudioNode,
  SendLocationNode,
  SendContactCardNode,
  TypingNode,
  SendButtonsNode,
  ReactLastMessageNode,
  DeleteLastMessageNode,
  GroupInviteNode,
  GroupAddNode,
  GroupRemoveNode,
  GroupRoleNode,
  JoinGroupNode,
  LeaveGroupNode,
  GroupSendTextNode,
  GroupSendImageNode,
  GroupSubjectNode,
  GroupDescriptionNode,
  GroupSettingNode,
  GroupRevokeInviteNode,
  ProfileNameNode,
  ProfileStatusNode,
  ProfilePictureNode,
  VerifyInGroupNode,
  VerifyLeftGroupNode,
  VerifyNumberExistsNode,
  ConditionNode,
  CheckJoinedNode,
  WaitNode,
  StopNode,
  HttpRequestNode
]);

export class NodeRegistry {
  #classes = new Map();
  #instances = new Map();

  constructor(nodeClasses = NODE_CLASSES) {
    for (const NodeClass of nodeClasses) {
      this.#classes.set(NodeClass.type, NodeClass);
      this.#instances.set(NodeClass.type, new NodeClass());
    }
  }

  static get categories() {
    return CATEGORIES;
  }

  has(type) {
    return this.#classes.has(type);
  }

  definitionOf(type) {
    const NodeClass = this.#classes.get(type);
    return NodeClass ? NodeClass.describe() : null;
  }

  classOf(type) {
    return this.#classes.get(type) ?? null;
  }

  instanceOf(type) {
    return this.#instances.get(type) ?? null;
  }

  isTrigger(type) {
    return this.#classes.get(type)?.category === 'trigger';
  }

  isCostly(type) {
    return Boolean(this.#classes.get(type)?.costly);
  }

  scopeOf(type) {
    return this.#classes.get(type)?.scope ?? 'run';
  }

  outputsOf(type) {
    return this.#classes.get(type)?.outputs ?? ['default'];
  }

  describeAll() {
    return [...this.#classes.values()].map((NodeClass) => NodeClass.describe());
  }

  types() {
    return [...this.#classes.keys()];
  }
}
