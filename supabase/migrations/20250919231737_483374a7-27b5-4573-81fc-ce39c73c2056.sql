-- Delete all events for Platform Engineers Salt Lake City group
DELETE FROM events WHERE group_id = 'd00fe817-431e-438f-9556-7ba706738b04';

-- Delete the Platform Engineers Salt Lake City group
DELETE FROM groups WHERE id = 'd00fe817-431e-438f-9556-7ba706738b04';