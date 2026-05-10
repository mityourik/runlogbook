delete from notifications a
using notifications b
where a.ctid < b.ctid
  and a.user_id = b.user_id
  and a.type = b.type
  and a.action_url = b.action_url;

alter table notifications
add constraint notifications_user_type_action_url_unique unique (user_id, type, action_url);
