--
-- PostgreSQL database dump
--

\restrict yWvQ62VuOqCYhORXpjJ0P1892HivcSgJgsviG8qZEW8yUeyKJoYhjAlZhYq32UL

-- Dumped from database version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id integer NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(50) NOT NULL,
    buy_rate numeric(18,4) NOT NULL,
    sell_rate numeric(18,4) NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: currencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.currencies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: currencies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.currencies_id_seq OWNED BY public.currencies.id;


--
-- Name: daily_balance_fx; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_balance_fx (
    id bigint NOT NULL,
    daily_balance_id bigint NOT NULL,
    currency_code character varying(10) NOT NULL,
    opening_amount numeric(18,2),
    closing_amount numeric(18,2),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: daily_balance_fx_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_balance_fx_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_balance_fx_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_balance_fx_id_seq OWNED BY public.daily_balance_fx.id;


--
-- Name: daily_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_balances (
    id integer NOT NULL,
    business_date date NOT NULL,
    opening_balance_mmk numeric(18,2) NOT NULL,
    closing_balance_mmk numeric(18,2),
    opened_at timestamp without time zone DEFAULT now() NOT NULL,
    closed_at timestamp without time zone
);


--
-- Name: daily_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_balances_id_seq OWNED BY public.daily_balances.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    date_time timestamp without time zone DEFAULT now() NOT NULL,
    type character varying(10) NOT NULL,
    currency_code character varying(10) NOT NULL,
    foreign_amount numeric(18,4) NOT NULL,
    rate numeric(18,4) NOT NULL,
    mmk_amount numeric(18,2) NOT NULL,
    customer_name character varying(100),
    created_by character varying(50),
    business_date date NOT NULL
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    full_name character varying(100) NOT NULL,
    password_hash text NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('admin'::character varying)::text, ('cashier'::character varying)::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: currencies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies ALTER COLUMN id SET DEFAULT nextval('public.currencies_id_seq'::regclass);


--
-- Name: daily_balance_fx id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balance_fx ALTER COLUMN id SET DEFAULT nextval('public.daily_balance_fx_id_seq'::regclass);


--
-- Name: daily_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances ALTER COLUMN id SET DEFAULT nextval('public.daily_balances_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: currencies currencies_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_key UNIQUE (code);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: daily_balance_fx daily_balance_fx_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balance_fx
    ADD CONSTRAINT daily_balance_fx_pkey PRIMARY KEY (id);


--
-- Name: daily_balances daily_balances_business_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT daily_balances_business_date_key UNIQUE (business_date);


--
-- Name: daily_balances daily_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT daily_balances_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: daily_balance_fx uq_daily_balance_currency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balance_fx
    ADD CONSTRAINT uq_daily_balance_currency UNIQUE (daily_balance_id, currency_code);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: transactions fk_currency; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_currency FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: daily_balance_fx fk_daily_balance; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balance_fx
    ADD CONSTRAINT fk_daily_balance FOREIGN KEY (daily_balance_id) REFERENCES public.daily_balances(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict yWvQ62VuOqCYhORXpjJ0P1892HivcSgJgsviG8qZEW8yUeyKJoYhjAlZhYq32UL

