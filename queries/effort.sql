/* Effort as the mean of per-bug ratios to control; per-bug verdicts are in `pnpm reeval query effort`. */
SELECT harness, environment AS arm,
       ROUND(AVG(tokens_ratio), 2) AS tokens_x, ROUND(AVG(agent_s_ratio), 2) AS time_x, ROUND(AVG(tools_ratio), 2) AS tools_x
FROM effort
WHERE run_id = '<run id>' AND role = 'variant'
GROUP BY harness, arm
