--  The integer-only interface between the Ada core and the browser host.
--  Every exported name starts with hs_ and is listed in build.sh.
with Interfaces;

package Hood.Host_ABI is

   use Interfaces;

   --  Error codes the host shows in the crash notice (all proposed).
   Error_Bounds           : constant := 1;  --  an index outside its table
   Error_Range            : constant := 2;  --  a value outside its range
   Error_Unexpected_State : constant := 3;  --  any other last-chance stop
   Error_Crash_Test       : constant := 4;  --  the Crash test button

   subtype Error_Code is Integer_32 range Error_Bounds .. Error_Crash_Test;

   --  Longest Ada file name kept for the crash notice.
   Max_File : constant := 64;

   function Build_Id return Integer_32
     with Export, Convention => C, External_Name => "hs_build_id";
   --  The build time as YYDDDHHMM (Europe/Berlin), from Hood.Version.

   function State_Hash return Unsigned_32
     with Export, Convention => C, External_Name => "hs_state_hash";
   --  Hood.World.Hash of the current world; 0 before hs_new_game.

   procedure New_Game
     (City_Seed, Auto_Seed : Unsigned_32; Blocks_X, Blocks_Y : Integer_32)
     with Export, Convention => C, External_Name => "hs_new_game";
   --  A new world. Seeds cross as 32-bit patterns (seeds above 2**31 are
   --  common). Sizes outside 8 .. 44 by 8 .. 35 blocks are clamped.

   Stream_Main  : constant := 1;  --  mulberry32 values (proposed numbers)
   Stream_Int   : constant := 2;  --  int (0, 99) on mulberry32
   Stream_Plan  : constant := 3;  --  city-plan LCG values
   Max_Draws    : constant := 1_000;

   function Rng_Value (Stream, Index : Integer_32) return Unsigned_32
     with Export, Convention => C, External_Name => "hs_rng_value";
   --  The Index-th value (1-based) of Stream, freshly seeded with the
   --  current world's city seed; 0 for an unknown stream or index.

   function Grid_W return Integer_32
     with Export, Convention => C, External_Name => "hs_grid_w";
   function Grid_H return Integer_32
     with Export, Convention => C, External_Name => "hs_grid_h";
   --  Cells across and down in the current world.

   function Cell_Kind (X, Y : Integer_32) return Integer_32
     with Export, Convention => C, External_Name => "hs_cell_kind";
   --  0 street, 1 block, -1 outside the matrix.

   Check_Count : constant := 9;

   function Check_Value (Id : Integer_32) return Integer_32
     with Export, Convention => C, External_Name => "hs_check_value";
   --  Number checks shown on the page (ids proposed):
   --  1 54 units in map units, 2 10.8 units (54/5), 3 distance (3, 4),
   --  4 distance (1, 1), 5 sin 45 degrees, 6 cos 0, 7 atan2 (1, 1),
   --  8 the cell of x = 54 units, 9 cells in the Large city; 0 otherwise.

   procedure Crash_Test (Code : Integer_32)
     with Export, Convention => C, External_Name => "hs_crash_test",
          No_Return;
   --  Stops on purpose. Codes outside Error_Code count as
   --  Error_Unexpected_State. In the browser the stop goes through the
   --  last-chance handler to the host's hs_host_error (code, line).

   function Error_File_Length return Integer_32
     with Export, Convention => C, External_Name => "hs_error_file_length";
   --  Length of the Ada file name of the last stop, 0 before any stop.

   function Error_File_Char (Index : Integer_32) return Integer_32
     with Export, Convention => C, External_Name => "hs_error_file_char";
   --  Character code at Index (1-based) of that file name, 0 outside it.

   function Pending_Code return Error_Code;
   --  The code the next last-chance stop reports.

   procedure Set_Error_File (Name : String)
     with Post => Error_File_Length = Integer_32 (Integer'Min (Name'Length, Max_File));
   --  Keeps up to Max_File characters of Name.

end Hood.Host_ABI;
