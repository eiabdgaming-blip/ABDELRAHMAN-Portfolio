begin;

alter table public.portfolio_voice_notes
  drop constraint portfolio_voice_notes_format_check,
  add constraint portfolio_voice_notes_format_check check (format in ('mp3', 'wav', 'ogg'));

commit;
