/* Fix rate per family, harness and arm: a bug attempt counts as fixed when it passes `flow works`; a build attempt counts as built when every requirement check passes, a requirement being any build assertion outside the fixed non-requirement set (`agent works` in runs before the split was the one requirement). */
SELECT e.file AS family, c.harness, c.environment AS arm,
       SUM(t.n > 0 AND t.passed = t.n) AS fixed, SUM(t.n > 0) AS counted, SUM(t.n IS NULL) AS not_run
FROM attempts a
JOIN cells c ON c.run_id = a.run_id AND c.eval_key = a.eval_key AND c.key = a.cell_key
JOIN evals e ON e.run_id = a.run_id AND e.key = a.eval_key
LEFT JOIN (
  SELECT s.run_id, s.attempt_key, COUNT(*) AS n, SUM(s.status = 'pass') AS passed
  FROM assertions s
  JOIN evals se ON se.run_id = s.run_id AND se.key = s.eval_key
  WHERE s.run_id = '<run id>' AND CASE se.file
    WHEN 'evals/genkit.eval.ts' THEN s.label = 'flow works'
    WHEN 'evals/build.eval.ts' THEN s.label NOT IN ('typechecks', 'keeps the flows', 'leaves package.json alone', 'agent ran without provider errors', 'verify ran')
  END
  GROUP BY s.run_id, s.attempt_key
) t ON t.run_id = a.run_id AND t.attempt_key = a.key
WHERE a.run_id = '<run id>'
GROUP BY family, c.harness, arm
ORDER BY family, c.harness, CASE c.environment WHEN 'control' THEN 0 WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'directed' THEN 3 WHEN 'skill' THEN 4 END
