/* Adoption: attempts with at least one genkit MCP call or one genkit subcommand.
   Tool and target names differ by harness; check them first with
     SELECT DISTINCT tool, target FROM tool_calls WHERE tool LIKE '%genkit%' OR target LIKE '%genkit%' */
SELECT c.harness, c.environment AS arm, COUNT(*) AS attempts,
       SUM(COALESCE(a.mcp_calls, 0) > 0) AS used_mcp, SUM(COALESCE(a.cli_calls, 0) > 0) AS used_cli
FROM attempts t
JOIN cells c ON c.run_id = t.run_id AND c.eval_key = t.eval_key AND c.key = t.cell_key
LEFT JOIN (
  SELECT run_id, attempt_key,
         SUM(tool LIKE 'mcp__genkit__%') AS mcp_calls,
         SUM(tool NOT LIKE 'mcp__%' AND (target LIKE '%genkit flow:%' OR target LIKE '%genkit trace:%'
             OR target LIKE '%genkit start%' OR target LIKE '%genkit docs:%' OR target LIKE '%genkit mcp%')) AS cli_calls
  FROM tool_calls WHERE run_id = '<run id>' GROUP BY run_id, attempt_key
) a ON a.run_id = t.run_id AND a.attempt_key = t.key
WHERE t.run_id = '<run id>'
GROUP BY c.harness, arm
ORDER BY c.harness, CASE c.environment WHEN 'control' THEN 0 WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'skill' THEN 3 END
