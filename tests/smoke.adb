--  Native smoke test (D-027): calls every hs_ export once with contracts on
--  and prints the values the browser page shows, so the two can be compared.
with Ada.Command_Line;
with Ada.Exceptions;
with Ada.Text_IO;
with Interfaces;
with Hood.Host_ABI;
with Hood.Version;

procedure Smoke is

   use Ada.Text_IO;
   use Interfaces;
   use Hood.Host_ABI;

   package Hex_IO is new Modular_IO (Unsigned_32);

   Failures : Natural := 0;

   procedure Check (Ok : Boolean; What : String) is
   begin
      if Ok then
         Put_Line ("ok    " & What);
      else
         Put_Line ("FAIL  " & What);
         Failures := Failures + 1;
      end if;
   end Check;

   --  FNV-1a over the four little-endian bytes of 1932, written out
   --  independently of Hood.Host_ABI.State_Hash.
   function Expected_Hash return Unsigned_32 is
      Bytes : constant array (1 .. 4) of Unsigned_32 := [16#8C#, 16#07#, 0, 0];
      H     : Unsigned_32 := 2_166_136_261;
   begin
      for B of Bytes loop
         H := (H xor B) * 16_777_619;
      end loop;
      return H;
   end Expected_Hash;

   function File_Name return String is
      Name : String (1 .. Integer (Error_File_Length));
   begin
      for I in Name'Range loop
         Name (I) := Character'Val (Error_File_Char (Integer_32 (I)));
      end loop;
      return Name;
   end File_Name;

begin
   Put_Line ("stamp          " & Hood.Version.Stamp);
   Put_Line ("hs_build_id   " & Integer_32'Image (Build_Id));
   Put ("hs_state_hash  " & Unsigned_32'Image (State_Hash) & "  ");
   Hex_IO.Put (State_Hash, Base => 16);
   New_Line;

   Check (Build_Id = Hood.Version.Build_Id, "hs_build_id matches the stamp");
   Check (State_Hash = Expected_Hash, "hs_state_hash is FNV-1a of seed 1932");
   Check (Error_File_Length = 0, "hs_error_file_length is 0 before a stop");
   Check (Error_File_Char (1) = 0, "hs_error_file_char is 0 outside the name");

   begin
      Crash_Test (Error_Crash_Test);
   exception
      when E : Program_Error =>
         Put_Line ("hs_crash_test (4) stopped at "
                   & Ada.Exceptions.Exception_Message (E));
   end;
   Check (Pending_Code = Error_Crash_Test, "hs_crash_test sets code 4");

   Set_Error_File ("hood-host_abi.adb");
   Check (File_Name = "hood-host_abi.adb",
          "hs_error_file_length/hs_error_file_char return the file name");

   if Failures = 0 then
      Put_Line ("smoke passed");
   else
      Put_Line ("smoke FAILED:" & Natural'Image (Failures));
      Ada.Command_Line.Set_Exit_Status (Ada.Command_Line.Failure);
   end if;
end Smoke;
