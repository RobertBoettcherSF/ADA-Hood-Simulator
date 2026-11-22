--  Browser build only: every stop (an explicit raise; checks are off with
--  -gnatp) ends here with the Ada file name and line.
with System;

procedure Hood.Last_Chance (Msg : System.Address; Line : Integer)
  with Export, Convention => C,
       External_Name => "__gnat_last_chance_handler",
       No_Return;
