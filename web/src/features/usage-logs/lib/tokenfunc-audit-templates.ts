/** TokenFunc 二开的审计动作 → 英文模板（与 controller/audit.go auditContentTemplates 对应），并入上游 AUDIT_TEMPLATES */
export const TOKENFUNC_AUDIT_TEMPLATES: Record<string, string> = {
  'promoter.create': 'Set user {{username}} (ID: {{user_id}}) as promoter',
  'promoter.update':
    'Updated promoter {{username}} (ID: {{user_id}}): remark {{remark}}, share rate {{share_rate}}%',
  'promoter.remove':
    'Removed promoter {{username}} (ID: {{user_id}}) and unbound {{unbound}} users',
  'promoter.bind':
    'Bound {{bound}} users to promoter {{username}} (ID: {{user_id}})',
  'promoter.unbind':
    'Unbound user {{target_username}} (ID: {{target_user_id}}) from promoter {{username}}',
  'promoter.settle':
    'Marked {{month}} as settled for promoter {{username}} (ID: {{user_id}}), amount {{amount_usd}} USD, reference {{reference}}',
  'promoter.settle_revert':
    'Reverted settlement of {{month}} for promoter {{username}} (ID: {{user_id}})',
  'log_archive.retry':
    'Retried log archive for {{day}} (status {{status}}, rows {{rows}})',
  'bill.archive':
    'Archived bill {{bill_no}} to object storage ({{detail_rows}} statement rows, {{raw_rows}} raw logs)',
}
