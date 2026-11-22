with Hood.Grid;
with Hood.Random;
with Hood.Trig;
with Hood.Units;
with Hood.Version;
with Hood.World;

package body Hood.Host_ABI is

   Pending   : Error_Code := Error_Unexpected_State;
   File      : String (1 .. Max_File) := [others => ' '];
   File_Last : Natural := 0;

   function Build_Id return Integer_32 is (Hood.Version.Build_Id);

   World   : Hood.World.World_State;
   Started : Boolean := False;

   function State_Hash return Unsigned_32 is
     (if Started then Hood.World.Hash (World) else 0);

   function Clamp (V, Low, High : Integer_32) return Integer_32 is
     (Integer_32'Max (Low, Integer_32'Min (High, V)));

   procedure New_Game
     (City_Seed, Auto_Seed : Unsigned_32; Blocks_X, Blocks_Y : Integer_32) is
   begin
      Hood.World.New_Game
        (World, City_Seed, Auto_Seed,
         Clamp (Blocks_X, Hood.Grid.Min_Blocks, Hood.Grid.Max_Blocks_X),
         Clamp (Blocks_Y, Hood.Grid.Min_Blocks, Hood.Grid.Max_Blocks_Y));
      Started := True;
   end New_Game;

   function Rng_Value (Stream, Index : Integer_32) return Unsigned_32 is
      Seed  : constant Unsigned_32 := (if Started then World.City_Seed else 0);
      Main  : Hood.Random.Mulberry := Hood.Random.Seeded (Seed);
      Plan  : Hood.Random.Plan_Lcg := Hood.Random.Plan_Seeded (Seed);
      U     : Unsigned_32 := 0;
      I     : Integer_32 := 0;
      P     : Hood.Random.Plan_Value := 0;
   begin
      if Index not in 1 .. Max_Draws then
         return 0;
      end if;
      for Draw in 1 .. Index loop
         case Stream is
            when Stream_Main => Hood.Random.Next (Main, U);
            when Stream_Int  => Hood.Random.Int (Main, 0, 99, I);
            when Stream_Plan => Hood.Random.Plan_Next (Plan, P);
            when others      => return 0;
         end case;
      end loop;
      case Stream is
         when Stream_Main => return U;
         when Stream_Int  => return Unsigned_32 (I);
         when others      => return Unsigned_32 (P);
      end case;
   end Rng_Value;

   function Grid_W return Integer_32 is
     (if Started then World.Blocks_X * Hood.Grid.Cells_Per_Block else 0);

   function Grid_H return Integer_32 is
     (if Started then World.Blocks_Y * Hood.Grid.Cells_Per_Block else 0);

   function Cell_Kind (X, Y : Integer_32) return Integer_32 is
     (if Started and then X in 0 .. Grid_W - 1 and then Y in 0 .. Grid_H - 1
      then Hood.Grid.Cell_Kind'Pos
             (World.Cells (Hood.Grid.Cell_X (X), Hood.Grid.Cell_Y (Y)).Kind)
      else -1);

   function Check_Value (Id : Integer_32) return Integer_32 is
      use Hood.Units;
   begin
      case Id is
         when 1 => return Integer_32 (Whole (54));
         when 2 => return Integer_32 (Ratio (54, 5));
         when 3 => return Integer_32 (Distance (Whole (3), Whole (4)));
         when 4 => return Integer_32 (Distance (Whole (1), Whole (1)));
         when 5 => return Hood.Trig.Sin (Hood.Trig.Eighth_Turn);
         when 6 => return Hood.Trig.Cos (0);
         when 7 => return Integer_32 (Hood.Trig.Atan2 (Whole (1), Whole (1)));
         when 8 => return Hood.Grid.Cell_Of (Whole (54));
         when 9 => return Hood.Grid.Max_W * Hood.Grid.Max_H;
         when others => return 0;
      end case;
   end Check_Value;

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
