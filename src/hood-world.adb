package body Hood.World is

   procedure New_Game
     (W                    : out World_State;
      City_Seed, Auto_Seed : Unsigned_32;
      Blocks_X, Blocks_Y   : Integer_32) is
   begin
      W.City_Seed := City_Seed;
      W.Auto_Seed := Auto_Seed;
      W.Blocks_X  := Blocks_X;
      W.Blocks_Y  := Blocks_Y;
      W.Main      := Hood.Random.Seeded (City_Seed);
      W.Plan      := Hood.Random.Plan_Seeded
                       (Hood.Random.City_Plan_Seed (City_Seed, 0));
      W.Week      := 1;
      W.Minute    := 0;
      Hood.Grid.Fill (W.Cells, Blocks_X, Blocks_Y);
   end New_Game;

   procedure Add (H : in out Unsigned_32; V : Unsigned_32) is
   begin
      for Byte in 0 .. 3 loop
         H := (H xor (Shift_Right (V, 8 * Byte) and 16#FF#)) * 16#0100_0193#;
      end loop;
   end Add;

   function Bits (V : Integer_32) return Unsigned_32 is
     (Unsigned_32 (Integer_64 (V) mod 2**32));

   function Hash (W : World_State) return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
   begin
      Add (H, W.City_Seed);
      Add (H, W.Auto_Seed);
      Add (H, Bits (W.Blocks_X));
      Add (H, Bits (W.Blocks_Y));
      Add (H, Hood.Random.State (W.Main));
      Add (H, Hood.Random.Plan_State (W.Plan));
      Add (H, Bits (W.Week));
      Add (H, Bits (W.Minute));
      for Y in 0 .. Hood.Grid.Cell_Y (W.Blocks_Y * Hood.Grid.Cells_Per_Block - 1) loop
         for X in 0 .. Hood.Grid.Cell_X (W.Blocks_X * Hood.Grid.Cells_Per_Block - 1) loop
            Add (H, Unsigned_32 (Hood.Grid.Cell_Kind'Pos (W.Cells (X, Y).Kind)));
            Add (H, Bits (W.Cells (X, Y).Block_Id));
         end loop;
      end loop;
      return H;
   end Hash;

end Hood.World;
