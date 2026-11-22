with Interfaces;
with Hood.Host_ABI;

procedure Hood.Last_Chance (Msg : System.Address; Line : Integer) is

   use Interfaces;

   procedure Host_Error (Code : Integer_32; At_Line : Integer_32)
     with Import, Convention => C, External_Name => "hs_host_error",
          No_Return;
   --  The host shows the crash notice and stops the call.

   --  Msg is a NUL-terminated file name such as "hood-host_abi.adb".
   Text : constant String (1 .. Hood.Host_ABI.Max_File)
     with Import, Address => Msg;
   Last : Natural := 0;

begin
   for C of Text loop
      exit when C = ASCII.NUL;
      Last := Last + 1;
   end loop;
   Hood.Host_ABI.Set_Error_File (Text (1 .. Last));
   Host_Error (Hood.Host_ABI.Pending_Code, Integer_32 (Line));
end Hood.Last_Chance;
