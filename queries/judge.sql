/* Mean score of the evidence-based diagnosis judge.
   For the summary judge, filter on 'Does the agent''s final message%' instead. */
SELECT c.harness, c.environment AS arm, COUNT(*) AS judged, ROUND(AVG(j.score), 2) AS evidence_score
FROM judgements j
JOIN attempts t ON t.run_id = j.run_id AND t.key = j.attempt_key
JOIN cells c ON c.run_id = t.run_id AND c.eval_key = t.eval_key AND c.key = t.cell_key
WHERE j.run_id = '<run id>' AND j.question LIKE 'Did the agent establish the root cause%'
GROUP BY c.harness, arm
