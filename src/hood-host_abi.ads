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

   --  The city (step 3). Numbers of counts, tables and fields are all
   --  proposed; the page reads them through these functions only.

   function City_Hash return Unsigned_32
     with Export, Convention => C, External_Name => "hs_city_hash";
   function Structure_Hash return Unsigned_32
     with Export, Convention => C, External_Name => "hs_structure_hash";
   --  Hood.City.City_Hash and Structure_Hash of the current city; 0 before
   --  hs_new_game.

   Count_Blocks     : constant := 1;
   Count_Merged     : constant := 2;
   Count_Lots       : constant := 3;
   Count_Buildings  : constant := 4;   --  live ones
   Count_Blocks_X   : constant := 5;
   Count_Blocks_Y   : constant := 6;
   Count_HQ         : constant := 7;
   Count_Status     : constant := 8;
   Count_Retries    : constant := 9;
   Count_Class      : constant := 10;  --  + Building_Class'Pos
   Count_District   : constant := 20;  --  + District'Pos
   Count_Use        : constant := 30;  --  + Block_Use'Pos
   Count_Types_Used : constant := 40;
   Count_Edge       : constant := 41;
   Count_Rng_Low    : constant := 42;  --  simulation stream state after
   Count_Rng_High   : constant := 43;  --  the city, low and high 16 bits

   function City_Count (What : Integer_32) return Integer_32
     with Export, Convention => C, External_Name => "hs_count";
   --  The count numbered What in the current city; 0 for an unknown one.

   Table_Block    : constant := 1;
   Table_Lot      : constant := 2;
   Table_Building : constant := 3;
   Table_HQ       : constant := 4;  --  index 1 .. 4

   --  Block fields
   F_GX : constant := 0;  F_GY : constant := 1;  F_District : constant := 2;
   F_Use : constant := 3;  F_Span_X : constant := 4;  F_Span_Y : constant := 5;
   F_Merged : constant := 6;  F_Land_Value : constant := 7;
   F_Squalor : constant := 8;  F_Content : constant := 9;  F_Rail : constant := 10;
   F_Landmark : constant := 11;  F_Name : constant := 12;  F_Module : constant := 13;
   F_Turn : constant := 14;  F_Center_X : constant := 15;  F_Center_Y : constant := 16;
   F_First_Lot : constant := 17;  F_Lots : constant := 18;  F_Plan_Value : constant := 19;
   --  Lot fields
   F_Lot_Block : constant := 0;  F_Lot_Index : constant := 1;  F_Lot_X : constant := 2;
   F_Lot_Y : constant := 3;  F_Lot_W : constant := 4;  F_Lot_H : constant := 5;
   F_Lot_Face : constant := 6;  F_Lot_Building : constant := 7;
   --  Building fields
   F_B_Lot : constant := 0;  F_B_Block : constant := 1;  F_B_Type : constant := 2;
   F_B_Class : constant := 3;  F_B_Storeys : constant := 4;  F_B_Trade : constant := 5;
   F_B_Removed : constant := 6;
   --  Headquarters fields
   F_HQ_Block : constant := 0;  F_HQ_Front : constant := 1;  F_HQ_Front_As : constant := 2;
   F_HQ_FX : constant := 3;  F_HQ_FY : constant := 4;

   function City_Get (Table, Index, Field : Integer_32) return Integer_32
     with Export, Convention => C, External_Name => "hs_get";
   --  One field of one row (positions in 1/256 m, booleans 0/1, missing
   --  ids -1); 0 for an unknown table, row or field.

   Layer_Blocks : constant := 1;  --  Block_Stride integers per block
   Layer_Lots   : constant := 2;  --  Lot_Stride integers per lot
   Block_Stride : constant := 12;
   --  gx, gy, district, use, span x, span y, merged into, land value,
   --  squalor, content, rail, landmark
   Lot_Stride   : constant := 10;
   --  block, index, x, y, w, h (1/256 m), face, type, class, storeys

   function Draw_Ptr (Layer : Integer_32) return Unsigned_32
     with Export, Convention => C, External_Name => "hs_draw_ptr";
   --  Address in linear memory of the layer's Integer_32 array (filled by
   --  hs_new_game); 0 for an unknown layer.

   function Draw_Len (Layer : Integer_32) return Integer_32
     with Export, Convention => C, External_Name => "hs_draw_len";
   --  Number of integers in the layer.

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
