with Hood.Version;

package body Hood.Host_ABI is

   Pending   : Error_Code := Error_Unexpected_State;
   File      : String (1 .. Max_File) := [others => ' '];
   File_Last : Natural := 0;

   function Build_Id return Integer_32 is (Hood.Version.Build_Id);

   function State_Hash return Unsigned_32 is
      Seed : constant Unsigned_32 := Hash_Seed;
      H    : Unsigned_32 := 16#811C_9DC5#;
   begin
      for Byte in 0 .. 3 loop
         H := (H xor (Shift_Right (Seed, 8 * Byte) and 16#FF#)) * 16#0100_0193#;
      end loop;
      return H;
   end State_Hash;

   procedure Crash_Test (Code : Integer_32) is
   begin
      Pending := (if Code in Error_Code then Code else Error_Unexpected_State);
      --  The browser runtime has no exception propagation: this raise goes
      --  straight to the last-chance handler, which is the point of the test.
      pragma Warnings (Off, "pragma Restrictions (No_Exception_Propagation)");
      pragma Warnings (Off, "Last_Chance_Handler will be called");
      raise Program_Error;
      pragma Warnings (On, "Last_Chance_Handler will be called");
      pragma Warnings (On, "pragma Restrictions (No_Exception_Propagation)");
   end Crash_Test;

   function Error_File_Length return Integer_32 is (Integer_32 (File_Last));

   function Error_File_Char (Index : Integer_32) return Integer_32 is
     (if Index in 1 .. Integer_32 (File_Last)
      then Character'Pos (File (Integer (Index)))
      else 0);

   function Pending_Code return Error_Code is (Pending);

   procedure Set_Error_File (Name : String) is
   begin
      File_Last := Integer'Min (Name'Length, Max_File);
      for I in 1 .. File_Last loop
         File (I) := Name (Name'First + I - 1);
      end loop;
   end Set_Error_File;

end Hood.Host_ABI;
