-- Migrate legacy compound action type values in AgentSuggestion
-- Replace compound values like 'create-story' → 'create', etc.

UPDATE AgentSuggestion SET actionType = 'create' WHERE actionType LIKE 'create-%';
UPDATE AgentSuggestion SET actionType = 'update' WHERE actionType LIKE 'update-%';
UPDATE AgentSuggestion SET actionType = 'delete' WHERE actionType LIKE 'delete-%';
