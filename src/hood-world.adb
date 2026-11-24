with Hood.Population.Setup;
with Hood.Population.Week;

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
      Hood.City.Generate (W.City, W.Main, City_Seed, Blocks_X, Blocks_Y);
      W.People.Count := 0;
      W.People.Status := Hood.Population.Status_Ok;
      if W.City.Status = Hood.City.Status_Ok then
         Hood.Population.Setup.Populate (W.People, W.City, W.Main);
      end if;
   end New_Game;

   procedure Sync (W : in out World_State) is
   begin
      W.Week := W.People.Week;
      W.Minute := W.People.Minute;
   end Sync;

   function Ready (W : World_State) return Boolean is
     (W.City.Status = Hood.City.Status_Ok and then not W.People.Game_Over);

   procedure Launch_Week (W : in out World_State) is
      use type Hood.Population.Phase_Kind;
   begin
      if Ready (W) and then W.People.Phase = Hood.Population.Planning then
         Hood.Population.Week.Launch (W.People, W.City);
         Sync (W);
      end if;
   end Launch_Week;

   procedure Run_Minutes
     (W : in out World_State; Minutes : Integer_32; Ran : out Integer_32)
   is
      use type Hood.Population.Phase_Kind;
   begin
      Ran := 0;
      if not Ready (W) or else W.People.Phase /= Hood.Population.Week_Running then
         return;
      end if;
      while Ran < Minutes and then W.People.Minute < Hood.Population.Minutes_Per_Week loop
         Hood.Population.Week.Tick (W.People, W.City, W.Main);
         Ran := Ran + 1;
      end loop;
      if W.People.Minute = Hood.Population.Minutes_Per_Week then
         Hood.Population.Week.Settle (W.People, W.City, W.Main);
      end if;
      Sync (W);
   end Run_Minutes;

   procedure Finish_Week (W : in out World_State) is
      use type Hood.Population.Phase_Kind;
   begin
      if Ready (W) and then W.People.Phase = Hood.Population.Week_Running then
         Hood.Population.Week.Finish (W.People, W.City, W.Main);
         Sync (W);
      end if;
   end Finish_Week;

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
      Add (H, W.City.City_Hash);
      if W.City.Status = Hood.City.Status_Ok then
         Add (H, Hood.Population.People_Hash (W.People, W.City));
         Add (H, Hood.Population.Position_Hash (W.People));
         Add (H, Hood.Population.Opinion_Hash (W.People));
         Add (H, Hood.Population.Name_Hash (W.People));
      end if;
      return H;
   end Hash;

end Hood.World;
