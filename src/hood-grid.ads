--  The map as one x/y matrix of cells (DESIGN 3.4). A cell is one fifth of a
--  block-plus-street pitch: 54 / 5 = 10.8 units (1.2.91 constants.ts:12-14,
--  fireRoll.ts:56). The street runs 7 units either side of each block line
--  (world.ts:33-34), so of a block's five cells the first and last are street
--  and the middle three are block (the 3 x 3 interior of citygen.ts:259).
with Interfaces;
with Hood.Units;

package Hood.Grid with Pure is

   use Interfaces;

   Cells_Per_Block : constant := 5;
   Pitch           : constant := 54 * Hood.Units.Scale;  --  13,824
   Street_Half     : constant := 7 * Hood.Units.Scale;   --  street edge
   Block_Size      : constant := 40 * Hood.Units.Scale;

   Min_Blocks   : constant := 8;    --  newGameValidation.ts:43-44
   Max_Blocks_X : constant := 44;   --  the Large city, newGameValidation.ts:17
   Max_Blocks_Y : constant := 35;

   Max_W : constant := Max_Blocks_X * Cells_Per_Block;  --  220
   Max_H : constant := Max_Blocks_Y * Cells_Per_Block;  --  175

   type Cell_X is range 0 .. Max_W - 1;
   type Cell_Y is range 0 .. Max_H - 1;

   type Cell_Kind is (Street, Block);  --  'Pos 0 and 1 (proposed)

   No_Block : constant := -1;

   type Cell is record
      Kind     : Cell_Kind;
      Block_Id : Integer_32;  --  gy * blocks across + gx, or No_Block
   end record;

   type Matrix is array (Cell_X, Cell_Y) of Cell;

   function Cell_Of (P : Hood.Units.Units) return Integer_32 is
     (Integer_32 (Hood.Units.Floor_Div (Integer_64 (P) * Cells_Per_Block, Pitch)));
   --  The cell index of a position: P * 5 / 13824, rounded down.

   function Kind_In_Pitch (I : Integer_32) return Cell_Kind is
     (if I mod Cells_Per_Block in 1 .. 3 then Block else Street);

   procedure Fill (M : out Matrix; Blocks_X, Blocks_Y : Integer_32)
     with Pre => Blocks_X in Min_Blocks .. Max_Blocks_X
                 and then Blocks_Y in Min_Blocks .. Max_Blocks_Y;
   --  Every cell of the matrix: inside the city by Kind_In_Pitch, outside
   --  it Street with No_Block.

end Hood.Grid;
