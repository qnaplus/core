-- Custom SQL migration file, put your code below! --

-- Reuses the VEX questions trigger function from 0007 as-is: it builds event
-- payloads from the updated row alone (OLD/NEW), so RECF questions produce the
-- same 'answered' and 'answer_edited' events. Note that `drizzle-kit push`
-- does not run custom SQL migrations, so this must be applied manually.
CREATE TRIGGER on_recf_questions_event_queue
AFTER UPDATE ON recf_questions
FOR EACH ROW
EXECUTE FUNCTION questions_update_event_queue();
