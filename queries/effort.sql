/* Effort per family as the mean of per-case ratios to control; per-case verdicts are in `pnpm reeval query effort`. */
SELECT e.file AS family, f.harness, f.environment AS arm,
       ROUND(AVG(f.tokens_ratio), 2) AS tokens_x, ROUND(AVG(f.agent_s_ratio), 2) AS time_x, ROUND(AVG(f.tools_ratio), 2) AS tools_x
FROM effort f
JOIN evals e ON e.run_id = f.run_id AND e.key = f.eval_key
WHERE f.run_id = '<run id>' AND f.role = 'variant'
GROUP BY family, f.harness, arm
