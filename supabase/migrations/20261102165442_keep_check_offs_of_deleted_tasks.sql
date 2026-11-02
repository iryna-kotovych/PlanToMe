-- Check-offs now stay when their task is deleted, so "Undo" brings a task
-- back with its check-offs on every device. Check-offs hold only an item id
-- and a day, and the list never shows them without their task.
drop trigger tasks_delete_completions on public.tasks;
drop function private.delete_task_completions();
