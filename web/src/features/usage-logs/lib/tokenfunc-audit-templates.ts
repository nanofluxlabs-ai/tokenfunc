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
  'enterprise.create':
    'Created enterprise {{enterprise_name}} (ID: {{enterprise_id}}, mode {{mode}})',
  'enterprise.update':
    'Updated enterprise {{enterprise_name}} (ID: {{enterprise_id}})',
  'enterprise.credit.configure':
    'Configured credit for enterprise {{enterprise_id}}: {{cycle_type}}, limit {{limit_usd}} USD',
  'enterprise.credit.disable':
    'Switched enterprise {{enterprise_id}} back to prepaid',
  'enterprise.credit.period_open':
    'Opened credit period #{{period_no}} (ID: {{period_id}}) for enterprise {{enterprise_id}}',
  'enterprise.status': 'Set enterprise {{enterprise_id}} status to {{status}}',
  'enterprise.topup':
    'Registered offline top-up of {{amount_usd}} USD for enterprise {{enterprise_id}} (ref {{reference}})',
  'enterprise.bill.payment':
    'Registered payment of {{amount_usd}} USD for bill {{bill_no}} (status {{status}})',
  'enterprise.bill.void':
    'Voided bill {{bill_no}} (ID: {{bill_id}}): {{remark}}',
  'enterprise.bill.issue_now':
    'Issued bill {{bill_no}} immediately for credit period {{period_id}}',
  'enterprise.adjustment.wallet':
    'Adjusted balance of enterprise {{enterprise_id}} by {{amount_usd}} USD: {{remark}}',
  'enterprise.adjustment.bill':
    'Adjusted bill {{bill_no}} of enterprise {{enterprise_id}} by {{amount_usd}} USD: {{remark}}',
  'enterprise.seller_profile.update': 'Updated seller profile {{company_name}}',
  'enterprise.team.create': 'Created team {{team_name}} (ID: {{team_id}})',
  'enterprise.team.update': 'Updated team {{team_name}} (ID: {{team_id}})',
  'enterprise.team.archive': 'Archived team {{team_id}}',
  'enterprise.team.delete': 'Deleted team {{team_id}}',
  'enterprise.member.login_bind':
    'Bound account {{username}} (ID: {{user_id}}) to member {{member_id}} as {{role}}',
  'enterprise.member.login_provision':
    'Provisioned account {{username}} (ID: {{user_id}}) for member {{member_id}} as {{role}}',
  'enterprise.member.login_unbind':
    'Unbound account {{user_id}} from member {{member_id}}',
  'enterprise.member.role':
    'Changed role of member {{member_id}} from {{from}} to {{to}}',
}
