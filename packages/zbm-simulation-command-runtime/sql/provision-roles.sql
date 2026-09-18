-- Privileged bootstrap only; ordinary migrations never create roles or credentials.
CREATE ROLE zbm_sim_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE zbm_sim_migrator NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT zbm_sim_owner TO zbm_sim_migrator;
GRANT zbm_ae_simulation_bridge TO zbm_sim_owner;
CREATE ROLE zbm_sim_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE zbm_sim_result_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE zbm_sim_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Runtime groups receive only enumerated D function grants in the D migration.
-- B bridge membership belongs only to the D owner, never runtime logins.
