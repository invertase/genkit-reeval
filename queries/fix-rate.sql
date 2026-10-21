/* Fix rate per family, harness and arm: an attempt counts as fixed when it passes `flow works` (bugs) or every requirement check (build tasks; `agent works` in runs before the split). */
SELECT e.file AS family, c.harness, c.environment AS arm,
       SUM(t.n > 0 AND t.passed = t.n) AS fixed, SUM(t.n > 0) AS counted, SUM(t.n IS NULL) AS not_run
FROM attempts a
JOIN cells c ON c.run_id = a.run_id AND c.eval_key = a.eval_key AND c.key = a.cell_key
JOIN evals e ON e.run_id = a.run_id AND e.key = a.eval_key
LEFT JOIN (
  SELECT run_id, attempt_key, COUNT(*) AS n, SUM(status = 'pass') AS passed
  FROM assertions
  WHERE run_id = '<run id>' AND label IN (
    'flow works', 'agent works',
    'shipped order', 'processing order', 'unknown order', 'looks the order up',
    'pauses for approval', 'declined refunds nothing', 'approved refunds the order total',
    'delegates orders', 'delegates refunds', 'resumes by session id'
  )
  GROUP BY run_id, attempt_key
) t ON t.run_id = a.run_id AND t.attempt_key = a.key
WHERE a.run_id = '<run id>'
GROUP BY family, c.harness, arm
ORDER BY family, c.harness, CASE c.environment WHEN 'control' THEN 0 WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'directed' THEN 3 WHEN 'skill' THEN 4 END
