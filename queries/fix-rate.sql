/* Fix rate per family, harness and arm: the `flow works` check for the bugs, `agent works` for the build tasks. */
SELECT e.file AS family, c.harness, c.environment AS arm,
       SUM(k.pass) AS fixed, SUM(k.pass + k.fail) AS counted, SUM(k.error) AS error, SUM(k.not_run) AS not_run
FROM cell_checks k
JOIN cells c ON c.run_id = k.run_id AND c.eval_key = k.eval_key AND c.key = k.cell_key
JOIN evals e ON e.run_id = k.run_id AND e.key = k.eval_key
WHERE k.run_id = '<run id>' AND k.label IN ('flow works', 'agent works')
GROUP BY family, c.harness, arm
ORDER BY family, c.harness, CASE c.environment WHEN 'control' THEN 0 WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'skill' THEN 3 END
